import sampleDiagnosticData from '../../../shared/sample_diagnostic.json';

/**
 * Returns a deep clone of the canonical 60-frame diagnostic dataset
 * (`shared/sample_diagnostic.json`), adjusted if the user switches target bow modes.
 *
 * @param {15 | 30 | 45} [targetBowAngle=45]
 * @returns {object}
 */
export function getSampleDiagnostic(targetBowAngle = 45) {
  const cloned = JSON.parse(JSON.stringify(sampleDiagnosticData));
  cloned.target_bow_angle = targetBowAngle;
  return cloned;
}

export default sampleDiagnosticData;

