import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  averageVector3D,
  buildSimulatedPoseFrame,
  evaluateFrameKinematics,
  extractBiomechanicalVectors,
} from './kinematicsMath.js';

const LOCAL_WASM_PATH = '/mediapipe/wasm';
const LOCAL_POSE_MODEL_PATH = '/mediapipe/pose_landmarker_lite.task';
const CDN_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const CDN_POSE_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const FRAME_INTERVAL_MS = 1000 / 30;
const CALIBRATION_DURATION_MS = 1000;

/**
 * Manages MediaPipe PoseLandmarker lifecycle, real 30 FPS webcam capture,
 * initial 1.0s upright calibration (`v_base`), and privacy-preserving skeletal
 * coordinate buffer collection.
 */
export function usePoseTracker({ videoRef }) {
  const [trackerStatus, setTrackerStatus] = useState('initializing'); // 'initializing' | 'camera_active' | 'simulated' | 'camera_error'
  const [statusDetail, setStatusDetail] = useState('カメラ接続中... (Connecting Camera)');
  const [cameraError, setCameraError] = useState(null);
  const [liveTelemetry, setLiveTelemetry] = useState(() => {
    const initialFrame = buildSimulatedPoseFrame(0, 1.5, 2.2);
    return {
      torsoAngleDeg: initialFrame.torso_angle_deg,
      neckAngleDeg: initialFrame.neck_angle_deg,
      shoulderTilt: 0.005,
      postureOk: true,
      calibrated: true,
      currentFrame: initialFrame,
      fps: 30,
    };
  });

  const landmarkerRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const rafIdRef = useRef(null);
  const isRecordingRef = useRef(false);
  const sessionStartMsRef = useRef(0);
  const lastFrameProcessedMsRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const recordedFramesRef = useRef([]);
  const calibrationVectorsRef = useRef([]);
  const baselineVectorRef = useRef({ x: 0.0, y: -1.0, z: 0.0 });
  const smoothingBufferRef = useRef([]);
  const simStartMsRef = useRef(performance.now());

  const stopLoopAndStream = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const runSimulationTick = useCallback((nowMs) => {
    if (nowMs - lastFrameProcessedMsRef.current >= FRAME_INTERVAL_MS) {
      lastFrameProcessedMsRef.current = nowMs;
      const elapsedSec = (nowMs - simStartMsRef.current) / 1000.0;
      const cycle = elapsedSec % 6.0;
      let simulatedAngle = 1.4;
      if (cycle >= 1.5 && cycle < 2.7) {
        const p = (cycle - 1.5) / 1.2;
        simulatedAngle = 1.4 + 30.6 * 0.5 * (1 - Math.cos(Math.PI * p));
      } else if (cycle >= 2.7 && cycle < 3.7) {
        simulatedAngle = 32.0;
      } else if (cycle >= 3.7 && cycle < 4.9) {
        const p = (cycle - 3.7) / 1.2;
        simulatedAngle = 1.4 + 30.6 * 0.5 * (1 + Math.cos(Math.PI * p));
      }

      const relMs = isRecordingRef.current
        ? Math.max(0, Math.round(nowMs - sessionStartMsRef.current))
        : Math.round(elapsedSec * 1000);

      const frame = buildSimulatedPoseFrame(relMs, simulatedAngle, 2.5);
      if (isRecordingRef.current) {
        recordedFramesRef.current.push(frame);
      }

      setLiveTelemetry({
        torsoAngleDeg: frame.torso_angle_deg,
        neckAngleDeg: frame.neck_angle_deg,
        shoulderTilt: 0.006,
        postureOk: frame.posture_ok,
        calibrated: true,
        currentFrame: frame,
        fps: 30,
      });
    }
    rafIdRef.current = requestAnimationFrame(runSimulationTick);
  }, []);

  const runCameraInferenceTick = useCallback(
    (nowMs) => {
      const videoEl = videoRef?.current;
      const landmarker = landmarkerRef.current;

      if (
        videoEl &&
        landmarker &&
        videoEl.readyState >= 2 &&
        nowMs - lastFrameProcessedMsRef.current >= FRAME_INTERVAL_MS
      ) {
        lastFrameProcessedMsRef.current = nowMs;
        if (videoEl.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = videoEl.currentTime;
          try {
            const result = landmarker.detectForVideo(videoEl, nowMs);

            if (
              result &&
              result.landmarks?.length > 0 &&
              result.worldLandmarks?.length > 0
            ) {
              const lm2d = result.landmarks[0].map((pt) => ({
                x: Number(pt.x.toFixed(5)),
                y: Number(pt.y.toFixed(5)),
                z: Number((pt.z ?? 0).toFixed(5)),
                visibility: Number((pt.visibility ?? 1.0).toFixed(4)),
              }));
              const lm3d = result.worldLandmarks[0].map((pt) => ({
                x: Number(pt.x.toFixed(5)),
                y: Number(pt.y.toFixed(5)),
                z: Number(pt.z.toFixed(5)),
                visibility: Number((pt.visibility ?? 1.0).toFixed(4)),
              }));

              const relMs = isRecordingRef.current
                ? Math.max(0, Math.round(nowMs - sessionStartMsRef.current))
                : Math.round(nowMs - simStartMsRef.current);

              if (
                relMs <= CALIBRATION_DURATION_MS ||
                calibrationVectorsRef.current.length < 15
              ) {
                const { vTorso } = extractBiomechanicalVectors(lm3d);
                calibrationVectorsRef.current.push(vTorso);
                if (calibrationVectorsRef.current.length > 30) {
                  calibrationVectorsRef.current.shift();
                }
                baselineVectorRef.current = averageVector3D(
                  calibrationVectorsRef.current
                );
              }

              const { torsoAngleDeg, neckAngleDeg, shoulderTilt, postureOk } =
                evaluateFrameKinematics(
                  lm2d,
                  lm3d,
                  baselineVectorRef.current,
                  smoothingBufferRef.current
                );

              const poseFrame = {
                timestamp_ms: relMs,
                landmarks_2d: lm2d,
                world_landmarks_3d: lm3d,
                torso_angle_deg: torsoAngleDeg,
                neck_angle_deg: neckAngleDeg,
                posture_ok: postureOk,
              };

              if (isRecordingRef.current) {
                recordedFramesRef.current.push(poseFrame);
              }

              setLiveTelemetry({
                torsoAngleDeg,
                neckAngleDeg,
                shoulderTilt,
                postureOk,
                calibrated: calibrationVectorsRef.current.length >= 10,
                currentFrame: poseFrame,
                fps: 30,
              });
            }
          } catch (_detectErr) {
            // Ignore transient frame timestamp collisions
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(runCameraInferenceTick);
    },
    [videoRef]
  );

  const loadPoseLandmarker = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;

    let vision;
    try {
      vision = await FilesetResolver.forVisionTasks(LOCAL_WASM_PATH);
    } catch (_localErr) {
      vision = await FilesetResolver.forVisionTasks(CDN_WASM_PATH);
    }

    for (const modelPath of [LOCAL_POSE_MODEL_PATH, CDN_POSE_MODEL_PATH]) {
      for (const delegate of ['GPU', 'CPU']) {
        try {
          const instance = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate,
            },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
          landmarkerRef.current = instance;
          return instance;
        } catch (_err) {
          // Try next delegate / path
        }
      }
    }
    throw new Error('PoseLandmarker initialization failed');
  }, []);

  const initializeTracker = useCallback(async () => {
    setTrackerStatus('initializing');
    setStatusDetail('Webカメラ起動中... (Starting Webcam)');
    setCameraError(null);
    stopLoopAndStream();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API unavailable in this browser');
      }

      // 1. Request webcam video stream FIRST so the user sees their live camera immediately
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        },
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef?.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setTrackerStatus('camera_active');
      setStatusDetail('AI骨格モデル読込中... (Loading Pose AI)');

      // 2. Load local MediaPipe PoseLandmarker WASM & model asset
      await loadPoseLandmarker();

      simStartMsRef.current = performance.now();
      calibrationVectorsRef.current = [];
      smoothingBufferRef.current = [];
      setStatusDetail('カメラ稼働中 (Webcam Live · 30 FPS)');
      rafIdRef.current = requestAnimationFrame(runCameraInferenceTick);
      return 'camera_active';
    } catch (err) {
      setCameraError(err?.message || 'Camera access declined or unavailable');
      simStartMsRef.current = performance.now();
      setTrackerStatus('simulated');
      setStatusDetail('デモ骨格モード (Demo Skeleton · No Camera)');
      rafIdRef.current = requestAnimationFrame(runSimulationTick);
      return 'simulated';
    }
  }, [loadPoseLandmarker, runCameraInferenceTick, runSimulationTick, stopLoopAndStream, videoRef]);

  const recalibrateUprightBaseline = useCallback(() => {
    calibrationVectorsRef.current = [];
    smoothingBufferRef.current = [];
    simStartMsRef.current = performance.now();
  }, []);

  const startSessionCapture = useCallback(async () => {
    recordedFramesRef.current = [];
    calibrationVectorsRef.current = [];
    smoothingBufferRef.current = [];
    sessionStartMsRef.current = performance.now();
    isRecordingRef.current = true;

    if (trackerStatus !== 'camera_active' && !mediaStreamRef.current) {
      await initializeTracker();
    }
  }, [initializeTracker, trackerStatus]);

  const stopSessionCapture = useCallback(() => {
    isRecordingRef.current = false;
    return [...recordedFramesRef.current];
  }, []);

  // Automatically start the real webcam when PracticeView mounts
  useEffect(() => {
    initializeTracker();
    return () => {
      stopLoopAndStream();
    };
  }, [initializeTracker, stopLoopAndStream]);

  return {
    trackerStatus,
    statusDetail,
    cameraError,
    liveTelemetry,
    initializeTracker,
    recalibrateUprightBaseline,
    startSessionCapture,
    stopSessionCapture,
  };
}
