import { wrap } from "@jsonrpc-rx/client";
import type { HandlersType } from "../types/handlers";
import { useContext, useMemo } from "react";
import { JsonrpcClientContext } from "../contexts/jsonrpc-rx-context";
import { logUiAction } from "../lib/ui-logger";

export const useHandlers = () => {
  const jsonrpcClient = useContext(JsonrpcClientContext);
  if (jsonrpcClient == null) {
    throw new Error("useHandlers must be used within a JsonrpcClientContextProvider");
  }
  const handlers = useMemo(() => wrap<HandlersType>(jsonrpcClient), [jsonrpcClient]);
  return useMemo(() => {
    return new Proxy(handlers, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown;
        if (typeof prop !== "string") {
          return value;
        }
        if (typeof value !== "function") {
          return value;
        }
        return (...args: unknown[]) => {
          logUiAction(prop, args);
          return (value as (...inner: unknown[]) => unknown)(...args);
        };
      },
    });
  }, [handlers]);
};
