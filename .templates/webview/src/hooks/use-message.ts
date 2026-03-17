import { useMemo } from 'react';
import { useHandlers } from './use-handlers';

type MessageType = { from?: string; value?: any }; // Informal message payload between webviews

const MY_MESSAGE_CHANNEL = 'view-react';
const VUE_MESSAGE_CHANNEL = 'view-vue';

export const useMessage = () => {
  const handlers = useHandlers();
  return useMemo(() => {
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) {
      return {
        listeningMessage: () => () => undefined,
        sendMessage: () => undefined,
        sendMessageToVue: () => undefined,
      };
    }

    // Register a channel
    handlers.registerChannel(MY_MESSAGE_CHANNEL);

    // Send a message
    const sendMessage = (channel: string, value: any) => {
      const msgBody: MessageType = {
        from: MY_MESSAGE_CHANNEL,
        value,
      };
      handlers.sendMessage(channel, msgBody);
    };

    // Listen for messages
    const rmListenerSet: Set<Function> = new Set();
    const listeningMessage = (listener: (value?: any, from?: string) => void) => {
      let rmListener: () => void;
      (async () => {
        const listenerNumber = await handlers.addMessageListener(MY_MESSAGE_CHANNEL, (msg) => {
          const { value, from } = (msg as MessageType) ?? {};
          listener(value, from);
        });
        rmListener = () => {
          handlers.rmMessageListener(MY_MESSAGE_CHANNEL, listenerNumber);
        };
        rmListenerSet.add(rmListener);
      })();

      return () => {
        if (rmListenerSet.delete(rmListener)) {
          rmListener();
        }
      };
    };

    // Remove listeners when the panel unloads
    window.addEventListener('unload', () => {
      for (const listener of rmListenerSet) {
        listener();
      }
      rmListenerSet.clear();
    });

    return {
      listeningMessage,
      sendMessage,
      sendMessageToVue: sendMessage.bind({}, VUE_MESSAGE_CHANNEL),
    };
  }, []);
};
