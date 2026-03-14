import type { HandlerDependencies } from "./types";
import { UniversalConfigService } from "../service/universal-config-service";
import type { UniversalConfig } from "../../shared/universal";
import { fetchWorkShellSummary } from "../service/work-mcp-client";
import type { WorkShellSummary } from "work-shared/domain/shell";

type UniversalDependencies = Pick<HandlerDependencies, "context">;

export const createUniversalHandlers = ({ context }: UniversalDependencies) => {
  const service = new UniversalConfigService(context.extensionPath);

  return {
    getUniversalConfig: async (): Promise<UniversalConfig> => {
      return service.getConfig();
    },
    getWorkShellSummary: async (): Promise<WorkShellSummary> => {
      return await fetchWorkShellSummary();
    },
  };
};
