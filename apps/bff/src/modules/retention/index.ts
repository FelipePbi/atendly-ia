/**
 * Prazo de retenção configurável por negócio (Goal023, G-29).
 *
 * Duas metades que não se misturam: as rotas guardam o prazo e a regra de
 * confirmação de redução (WU-01) e **nunca** apagam dado; a varredura (WU-05)
 * é a única coisa aqui que purga, roda fora de requisição e só sobe quando
 * `RETENTION_SWEEP_ENABLED` está ligado.
 */
export { RetentionSweepWorker } from "./RetentionSweepWorker.js";
export { registerV1RetentionSettingsRoutes } from "./routes.js";
export {
  applyRetentionPatch,
  DEFAULT_COMMERCIAL_RETENTION_DAYS,
  DEFAULT_PERSONAL_RETENTION_DAYS,
  loadRetentionDays,
  loadRetentionState,
  RETENTION_DAYS_OPTIONS,
  type RetentionCategory,
  type RetentionDays,
  type RetentionDaysState,
  type RetentionPatchInput,
  retentionPatchSchema,
  type RetentionState,
} from "./settings.js";
export {
  defaultRetentionPorts,
  intentContentCutoff,
  type RetentionCutoffs,
  retentionCutoffs,
  type RetentionPurgePorts,
  type RetentionSourceName,
  type RetentionSweepPrisma,
  type RetentionSweepSummary,
  runRetentionSweep,
  sweepTenant,
} from "./sweep.js";
