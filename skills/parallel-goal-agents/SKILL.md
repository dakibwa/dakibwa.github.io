---
name: parallel-goal-agents
description: Use when the user asks Codex to work faster or better by setting an explicit goal, splitting a task into independent pieces, spawning parallel agents, assigning each agent a dedicated goal, and synthesizing returned results. Trigger on requests like "write yourself a new goal", "spawn agents in parallel", "as many agents as needed", "split the work into independent pieces", or "give each agent its own dedicated /goal".
---

# Parallel Goal Agents

Use this skill to turn a broad or high-stakes task into coordinated parallel work.

## Core Workflow

1. Create or state the task goal before dispatching work.
2. Split the task into independent pieces that can run concurrently.
3. Spawn as many agents as are useful, but no more than the task can genuinely absorb.
4. Give each agent a clear, dedicated goal and scope.
5. Dispatch agents concurrently when their work is independent.
6. Track returned results, resolve contradictions, and synthesize one coherent answer or implementation.
7. Keep ownership of the final result; do not simply paste subagent outputs together.

## Agent Goal Pattern

For each agent, define:

- Objective: the specific result needed.
- Scope: files, systems, evidence, or questions it should inspect.
- Exclusions: anything it should avoid touching or assuming.
- Output shape: concise findings, patch recommendations, test results, design critique, etc.

## Use Judgment

Use fewer agents for small tasks. Use more agents when independent workstreams exist, such as design critique, implementation, testing, documentation, deployment, performance, security, or source research.

Avoid spawning agents when the task is tiny, highly sequential, requires a single local edit, or would become slower through coordination overhead.

## Synthesis Rules

- Compare results instead of accepting the first answer.
- Prefer evidence from tools, tests, source files, screenshots, or live systems.
- Note unresolved conflicts or uncertainty.
- Convert the combined work into a single decisive next action or final answer.
