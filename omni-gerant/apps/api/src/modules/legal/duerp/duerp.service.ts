import { ok, err } from '@omni-gerant/shared';
import type { Result, AppError } from '@omni-gerant/shared';
import type { CreateDuerpInput, UpdateDuerpInput, RiskEntry } from './duerp.schemas.js';
import { getRisksByNafCode, calculateRiskLevel } from './risk-database.js';

// BUSINESS RULE [CDC-2.4]: Service DUERP

export interface DuerpDocument {
  id: string;
  tenant_id: string;
  title: string;
  company_name: string;
  naf_code: string | null;
  sector_name: string | null;
  address: string | null;
  employee_count: number;
  evaluator_name: string;
  evaluation_date: Date;
  risks: DuerpRisk[];
  version: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DuerpRisk {
  id: string;
  duerp_id: string;
  risk_id: string | null;
  category: string;
  name: string;
  description: string | null;
  gravity: number;
  probability: number;
  risk_level: number;
  risk_label: string;
  preventive_actions: string[];
  existing_measures: string | null;
  responsible: string | null;
  deadline: string | null;
}

export interface DuerpRepository {
  create(tenantId: string, data: Omit<DuerpDocument, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<DuerpDocument>;
  findById(id: string, tenantId: string): Promise<DuerpDocument | null>;
  findLatest(tenantId: string): Promise<DuerpDocument | null>;
  update(id: string, tenantId: string, data: Partial<DuerpDocument>): Promise<DuerpDocument | null>;
  softDelete(id: string, tenantId: string): Promise<boolean>;
  list(tenantId: string): Promise<DuerpDocument[]>;
}

function riskEntryToRisk(entry: RiskEntry, duerpId: string): DuerpRisk {
  const level = calculateRiskLevel(entry.gravity, entry.probability);
  return {
    id: crypto.randomUUID(),
    duerp_id: duerpId,
    risk_id: entry.risk_id ?? null,
    category: entry.category,
    name: entry.name,
    description: entry.description ?? null,
    gravity: entry.gravity,
    probability: entry.probability,
    risk_level: level.score,
    risk_label: level.level,
    preventive_actions: entry.preventive_actions,
    existing_measures: entry.existing_measures ?? null,
    responsible: entry.responsible ?? null,
    deadline: entry.deadline ?? null,
  };
}

export function createDuerpService(repo: DuerpRepository) {
  return {
    /**
     * Generate a new DUERP pre-filled with risks from NAF code
     */
    async generate(
      tenantId: string,
      input: CreateDuerpInput,
    ): Promise<Result<DuerpDocument, AppError>> {
      const riskProfile = getRisksByNafCode(input.naf_code);

      // Merge user-provided risks with NAF defaults
      const duerpId = crypto.randomUUID();
      const risks: DuerpRisk[] = [];
      const inputRisks = input.risks ?? [];

      // Add NAF-based defaults if no user risks provided
      if (inputRisks.length === 0) {
        for (const template of riskProfile.risks) {
          risks.push(riskEntryToRisk({
            risk_id: template.id,
            category: template.category,
            name: template.name,
            description: template.description,
            gravity: template.default_gravity,
            probability: template.default_probability,
            preventive_actions: template.preventive_actions,
          }, duerpId));
        }
      } else {
        for (const entry of inputRisks) {
          risks.push(riskEntryToRisk(entry, duerpId));
        }
      }

      const doc = await repo.create(tenantId, {
        tenant_id: tenantId,
        title: input.title ?? `DUERP - ${input.company_name}`,
        company_name: input.company_name,
        naf_code: input.naf_code ?? null,
        sector_name: riskProfile.sector_name,
        address: input.address ?? null,
        employee_count: input.employee_count,
        evaluator_name: input.evaluator_name,
        evaluation_date: input.evaluation_date ? new Date(input.evaluation_date) : new Date(),
        risks,
        version: 1,
        notes: null,
      });

      return ok(doc);
    },

    async getById(
      id: string,
      tenantId: string,
    ): Promise<Result<DuerpDocument, AppError>> {
      const doc = await repo.findById(id, tenantId);
      if (!doc) return err({ code: 'NOT_FOUND', message: `DUERP ${id} not found` });
      return ok(doc);
    },

    async getLatest(
      tenantId: string,
    ): Promise<Result<DuerpDocument | null, AppError>> {
      const doc = await repo.findLatest(tenantId);
      return ok(doc);
    },

    async update(
      id: string,
      tenantId: string,
      input: UpdateDuerpInput,
    ): Promise<Result<DuerpDocument, AppError>> {
      const existing = await repo.findById(id, tenantId);
      if (!existing) return err({ code: 'NOT_FOUND', message: `DUERP ${id} not found` });

      const updateData: Partial<DuerpDocument> = {};
      if (input.title) updateData.title = input.title;
      if (input.evaluator_name) updateData.evaluator_name = input.evaluator_name;
      if (input.notes !== undefined) updateData.notes = input.notes ?? null;
      if (input.risks) {
        updateData.risks = input.risks.map((r) => riskEntryToRisk(r, id));
      }
      updateData.version = existing.version + 1;

      const updated = await repo.update(id, tenantId, updateData);
      if (!updated) return err({ code: 'NOT_FOUND', message: `DUERP ${id} not found` });

      return ok(updated);
    },

    async delete(
      id: string,
      tenantId: string,
    ): Promise<Result<void, AppError>> {
      const deleted = await repo.softDelete(id, tenantId);
      if (!deleted) return err({ code: 'NOT_FOUND', message: `DUERP ${id} not found` });
      return ok(undefined);
    },

    async list(
      tenantId: string,
    ): Promise<Result<DuerpDocument[], AppError>> {
      const docs = await repo.list(tenantId);
      return ok(docs);
    },
  };
}
