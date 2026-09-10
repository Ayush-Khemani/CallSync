const { AGENT_TOOLS, executeAgentTool: executeCoreTool } = require('./agentTools');
const {
  AGENT_ACTION_TOOLS,
  AGENT_ACTION_TOOL_NAMES,
  executeAgentActionTool,
} = require('./agentActionTools');

const CALLSYNC_AGENT_TOOLS = [...AGENT_TOOLS, ...AGENT_ACTION_TOOLS];

async function executeAgentTool({ name, args, userId }) {
  if (AGENT_ACTION_TOOL_NAMES.has(name)) {
    return executeAgentActionTool({ name, args, userId });
  }
  return executeCoreTool({ name, args, userId });
}

module.exports = { CALLSYNC_AGENT_TOOLS, executeAgentTool };
