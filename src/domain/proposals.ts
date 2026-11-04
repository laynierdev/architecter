import { addComponent, addRelationship, removeComponent, removeRelationship, updateComponent } from "./architecture";
import { DomainError } from "./common";
import { ChangeProposalSchema } from "./schemas";
import { createSnapshot } from "./snapshots";
import type { ChangeOperation, ChangeProposal, Project } from "./types";

/**
 * AI-suggested architecture changes are only data until a user approves them.
 * Nothing in this module applies a proposal that has not been explicitly approved.
 */
export function approveProposal(proposal: ChangeProposal): ChangeProposal {
  if (proposal.status === "applied") throw new DomainError("This proposal was already applied");
  return { ...proposal, status: "approved" };
}

export function rejectProposal(proposal: ChangeProposal): ChangeProposal {
  if (proposal.status === "applied") throw new DomainError("This proposal was already applied");
  return { ...proposal, status: "rejected" };
}

/** Removes operations the user deselected during review. */
export function selectOperations(proposal: ChangeProposal, keepIndexes: number[]): ChangeProposal {
  const keep = new Set(keepIndexes);
  const operations = proposal.operations.filter((_, i) => keep.has(i));
  if (operations.length === 0) throw new DomainError("Select at least one change to apply");
  return { ...proposal, operations };
}

function applyOperation(project: Project, op: ChangeOperation): Project {
  switch (op.op) {
    case "add_component": {
      const { id, ...rest } = op.component;
      return addComponent(project, rest, id);
    }
    case "update_component":
      return updateComponent(project, op.id, op.changes);
    case "remove_component":
      return removeComponent(project, op.id);
    case "add_relationship": {
      const { id, ...rest } = op.relationship;
      return addRelationship(project, rest, id);
    }
    case "remove_relationship":
      return removeRelationship(project, op.id);
  }
}

/**
 * Applies an approved proposal atomically: either every operation succeeds or an error is thrown
 * and the original project is untouched. A snapshot of the previous architecture is saved first.
 */
export function applyProposal(project: Project, proposal: ChangeProposal): Project {
  const parsed = ChangeProposalSchema.safeParse(proposal);
  if (!parsed.success) throw new DomainError("The proposal is malformed and cannot be applied");
  if (parsed.data.status !== "approved") throw new DomainError("Only approved proposals can be applied");

  let next = createSnapshot(project, `Before: ${parsed.data.title}`);
  for (const op of parsed.data.operations) next = applyOperation(next, op);
  const { architectureStyle, styleJustification } = parsed.data;
  if (architectureStyle) next = { ...next, architectureStyle, styleJustification: styleJustification ?? next.styleJustification };
  return next;
}
