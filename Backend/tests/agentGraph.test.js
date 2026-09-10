const assert = require('node:assert/strict');
const { createAgentGraph, _test } = require('../src/services/agentGraphService');

function graphInput(overrides = {}) {
  return {
    providerInput: [{ role: 'user', content: 'Show my open tasks' }],
    userId: 42,
    userTimeZone: 'Europe/Budapest',
    round: 0,
    toolCalls: [],
    latestPayload: null,
    responseText: '',
    stopReason: '',
    ...overrides,
  };
}

(async () => {
  {
    let providerCalls = 0;
    const executed = [];
    const graph = createAgentGraph({
      providerCall: async (state) => {
        providerCalls += 1;
        if (providerCalls === 1) {
          return {
            data: {
              output: [{
                type: 'function_call',
                name: 'list_open_tasks',
                call_id: 'call-tasks',
                arguments: '{}',
              }],
            },
          };
        }

        const toolOutput = state.providerInput.find((item) => item.type === 'function_call_output');
        assert.ok(toolOutput, 'tool output should be carried into the next model node');
        assert.equal(toolOutput.call_id, 'call-tasks');
        return { data: { output_text: 'You have one open task.', output: [] } };
      },
      toolExecutor: async (call) => {
        executed.push(call);
        return {
          tasks: [{ actionId: 7, meetingId: 3, title: 'Send the deck' }],
        };
      },
    });

    const result = await graph.invoke(graphInput());
    assert.equal(providerCalls, 2);
    assert.equal(executed.length, 1);
    assert.equal(executed[0].name, 'list_open_tasks');
    assert.equal(executed[0].userId, 42);
    assert.equal(result.responseText, 'You have one open task.');
    assert.equal(result.stopReason, 'complete');
    assert.equal(result.round, 1);
    assert.deepEqual(result.latestPayload, {
      type: 'tasks',
      items: [{ actionId: 7, meetingId: 3, title: 'Send the deck' }],
    });
  }

  {
    let toolCalls = 0;
    const graph = createAgentGraph({
      providerCall: async () => ({
        data: {
          output: [{
            type: 'function_call',
            name: 'list_meetings',
            call_id: `call-${toolCalls}`,
            arguments: '{"status":"all"}',
          }],
        },
      }),
      toolExecutor: async () => {
        toolCalls += 1;
        return { meetings: [] };
      },
    });

    const result = await graph.invoke(graphInput());
    assert.equal(toolCalls, _test.MAX_TOOL_ROUNDS);
    assert.equal(result.stopReason, 'tool_limit');
    assert.match(result.responseText, /safe tool limit/i);
  }

  {
    const graph = createAgentGraph({
      providerCall: async () => ({
        data: {
          output: [{
            type: 'message',
            content: [{ type: 'output_text', text: 'No tool needed.' }],
          }],
        },
      }),
      toolExecutor: async () => {
        throw new Error('tool executor should not be called');
      },
    });

    const result = await graph.invoke(graphInput());
    assert.equal(result.responseText, 'No tool needed.');
    assert.equal(result.round, 0);
    assert.equal(result.stopReason, 'complete');
  }

  {
    let seenTimeZone = null;
    const graph = createAgentGraph({
      providerCall: async () => ({
        data: {
          output: [{
            type: 'function_call',
            name: 'prepare_reschedule',
            call_id: 'call-move',
            arguments: '{"meetingId":12,"request":"Thursday afternoon","timeZone":""}',
          }],
        },
      }),
      toolExecutor: async ({ args }) => {
        seenTimeZone = args.timeZone;
        return { status: 'needs_input', missing: ['new date'] };
      },
    });

    const result = await graph.invoke(graphInput({ userTimeZone: 'Europe/Budapest', round: _test.MAX_TOOL_ROUNDS - 1 }));
    assert.equal(seenTimeZone, 'Europe/Budapest');
    assert.equal(result.stopReason, 'tool_limit');
  }

  console.log('LangGraph agent routing tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
