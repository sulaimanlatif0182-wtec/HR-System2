import Evaluation from './performance/Evaluation';

// The Performance feature is now the department-scoped Evaluation module only.
// The legacy Appraisal tab was removed permanently (see docs/specs/
// 2026-10-22-evaluation-redesign-design.md).
export default function Performance() {
  return <Evaluation />;
}
