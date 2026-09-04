import { createLogger } from "../../../core/logger.js";

const log = createLogger("node");

export default {
  name: "disconnect",
  emitter: "nodes",

  execute(client, node, reason) {
    log.warn(`Audio node "${node.id}" disconnected:`, reason?.reason ?? reason?.code ?? "unknown reason");
  },
};
