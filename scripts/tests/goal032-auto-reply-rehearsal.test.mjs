// Guard permanente do ensaio do Goal032: recusa ANTES de qualquer conexão
// qualquer alvo que não seja loopback ou que não carregue a marca de
// descartável, e recusa um `GOAL032_BREAK_LINK` que não esteja registrado nos
// cinco elos declarados — nunca com skip, sempre com exit 2 e sem nenhuma
// credencial na saída.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { repositoryRoot } from "../lib/gate.mjs";
import {
  AutoReplyRehearsalError,
  BREAKABLE_LINKS,
  REHEARSAL,
  assertAutoReply,
  replyCount,
  resolveRehearsalPlan,
} from "../goal032-auto-reply-rehearsal.mjs";

const script = path.join(
  repositoryRoot,
  "scripts",
  "goal032-auto-reply-rehearsal.mjs",
);

const validUrl = "postgresql://pgtest:pgtest@127.0.0.1:55432/avenly_ai_test";
const notLoopbackUrl =
  "postgresql://pgtest:pgtest@db.example.com:55432/avenly_ai_test";
const notDisposableUrl =
  "postgresql://pgtest:pgtest@127.0.0.1:55432/avenly_ai";

function run(extraEnv) {
  return spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
  });
}

function runWithoutTarget() {
  const env = { ...process.env };
  delete env.AI_TEST_DATABASE_URL;
  return spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    env,
    encoding: "utf8",
  });
}

test("refuses a destination that is not loopback", () => {
  assert.throws(
    () => resolveRehearsalPlan({ AI_TEST_DATABASE_URL: notLoopbackUrl }),
    (error) =>
      error instanceof AutoReplyRehearsalError &&
      /is not loopback/u.test(error.message) &&
      !error.message.includes("pgtest:pgtest@"),
  );
});

test("refuses a database name that is not recognised as disposable", () => {
  assert.throws(
    () => resolveRehearsalPlan({ AI_TEST_DATABASE_URL: notDisposableUrl }),
    (error) =>
      error instanceof AutoReplyRehearsalError &&
      /not recognised as disposable/u.test(error.message) &&
      !error.message.includes("pgtest:pgtest@"),
  );
});

test("accepts a loopback, disposable target and derives its own database", () => {
  const plan = resolveRehearsalPlan({ AI_TEST_DATABASE_URL: validUrl });
  assert.equal(plan.host, "127.0.0.1");
  assert.equal(plan.ai.database, "avenly_ai_test_goal032");
});

test("the script exits 2 — never 0 and never skip — with its own message, and prints no credential", () => {
  const notLoopback = run({ AI_TEST_DATABASE_URL: notLoopbackUrl });
  assert.equal(notLoopback.status, 2);
  assert.match(
    notLoopback.stderr,
    /^goal032:auto-reply-rehearsal REFUSED — .*is not loopback/mu,
  );
  assert.ok(!notLoopback.stdout.includes("pgtest:pgtest@"));
  assert.ok(!notLoopback.stderr.includes("pgtest:pgtest@"));

  const notDisposable = run({ AI_TEST_DATABASE_URL: notDisposableUrl });
  assert.equal(notDisposable.status, 2);
  assert.match(
    notDisposable.stderr,
    /^goal032:auto-reply-rehearsal REFUSED — .*not recognised as disposable/mu,
  );
  assert.ok(!notDisposable.stdout.includes("pgtest:pgtest@"));
  assert.ok(!notDisposable.stderr.includes("pgtest:pgtest@"));
});

test("refuses with exit 2 and no credential when the target is entirely unset", () => {
  const outcome = runWithoutTarget();
  assert.equal(outcome.status, 2);
  assert.match(
    outcome.stderr,
    /^goal032:auto-reply-rehearsal REFUSED — /u,
  );
  assert.ok(!outcome.stdout.includes("pgtest:pgtest@"));
  assert.ok(!outcome.stderr.includes("pgtest:pgtest@"));
});

test("the five required links are registered, each with its own message", () => {
  assert.deepEqual(Object.keys(BREAKABLE_LINKS).sort(), [
    "group",
    "human-control",
    "idempotency",
    "ignore-ai",
    "supersede",
  ]);
  for (const message of Object.values(BREAKABLE_LINKS)) {
    assert.ok(typeof message === "string" && message.length > 0);
  }
});

test("refuses an unknown GOAL032_BREAK_LINK with exit 2 and no credential, before any connection", () => {
  const outcome = run({
    AI_TEST_DATABASE_URL: validUrl,
    GOAL032_BREAK_LINK: "not-a-real-link",
  });
  assert.equal(outcome.status, 2);
  assert.match(
    outcome.stderr,
    /^goal032:auto-reply-rehearsal REFUSED — Unknown GOAL032_BREAK_LINK "not-a-real-link"\. Known links: human-control, ignore-ai, idempotency, supersede, group\./mu,
  );
  assert.ok(!outcome.stdout.includes("pgtest:pgtest@"));
  assert.ok(!outcome.stderr.includes("pgtest:pgtest@"));
});

// A resposta da IA sai em partes (decisão de produto de 2026-10-11): a prova
// positiva conta respostas, não envios, e exige que as partes reconstruam o
// texto do dublê de modelo e que a última carregue o correlationId da linha.
function autoReplyResult(sends, returnedText = "Oi, Nina! Aqui e o Estudio.") {
  return {
    worker: { events: [{ status: "DONE" }] },
    model: { returnedTexts: [returnedText] },
    messages: [{ direction: "OUTBOUND", body: returnedText }],
    transport: {
      sends: sends.map((send) => ({
        to: REHEARSAL.contact.phone,
        observedAtSendTime: { outboundMessages: 1 },
        ...send,
      })),
    },
  };
}

const splitReply = [
  { text: "Oi, Nina!", correlationId: "ai-1-p1" },
  { text: "Aqui e o Estudio.", correlationId: "ai-1" },
];

test("replyCount groups the parts of one reply by their base correlationId", () => {
  assert.equal(replyCount(splitReply), 1);
  assert.equal(
    replyCount([...splitReply, { text: "x", correlationId: "ai-2" }]),
    2,
  );
});

test("a reply sent in parts that rebuild the model text passes", () => {
  assert.doesNotThrow(() => assertAutoReply(autoReplyResult(splitReply)));
});

test("a single-part reply still passes", () => {
  assert.doesNotThrow(() =>
    assertAutoReply(
      autoReplyResult([
        { text: "Oi, Nina! Aqui e o Estudio.", correlationId: "ai-1" },
      ]),
    ),
  );
});

test("parts that do not rebuild the model text fail", () => {
  assert.throws(
    () =>
      assertAutoReply(
        autoReplyResult([
          { text: "Oi, Nina!", correlationId: "ai-1-p1" },
          { text: "Outra coisa.", correlationId: "ai-1" },
        ]),
      ),
    AutoReplyRehearsalError,
  );
});

test("two replies for one turn fail", () => {
  assert.throws(
    () =>
      assertAutoReply(
        autoReplyResult([
          { text: "Oi, Nina!", correlationId: "ai-1" },
          { text: "Aqui e o Estudio.", correlationId: "ai-2" },
        ]),
      ),
    AutoReplyRehearsalError,
  );
});

test("a sequence whose last part carries a -pN id fails", () => {
  assert.throws(
    () =>
      assertAutoReply(
        autoReplyResult([
          { text: "Oi, Nina!", correlationId: "ai-1-p1" },
          { text: "Aqui e o Estudio.", correlationId: "ai-1-p2" },
        ]),
      ),
    AutoReplyRehearsalError,
  );
});
