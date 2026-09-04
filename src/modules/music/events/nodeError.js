import { createLogger } from "../../../core/logger.js";

const log = createLogger("node");

export default {
  name: "error",
  emitter: "nodes",

  execute(client, node, error) {
    log.error(`Audio node "${node.id}" error:`, error?.message ?? error);
  },
};
