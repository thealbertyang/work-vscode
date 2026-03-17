import type { HandlerDependencies } from "./types";
import { UniversalConfigService } from "../service/universal-config-service";
import type { UniversalConfig } from "../../shared/universal";
import { fetchWorkAppSummary } from "../service/work-mcp-client";
import type { WorkAppSummary } from "work-shared/domain/app";

type UniversalDependencies = Pick<HandlerDependencies, "context">;

export const createUniversalHandlers = ({ context }: UniversalDependencies) => {
  const service = new UniversalConfigService(context.extensionPath);

  return {
    getUniversalConfig: async (): Promise<UniversalConfig> => {
      return service.getConfig();
    },
    getWorkAppSummary: async (): Promise<WorkAppSummary> => {
      return await fetchWorkAppSummary();
    },
  };
};
