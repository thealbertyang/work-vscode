export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildTmuxAttachCommand(sessionName: string, windowIndex?: string): string {
  const quotedSession = shellQuote(sessionName);
  const quotedWindow = windowIndex ? shellQuote(`${sessionName}:${windowIndex}`) : null;
  const missingMessage = shellQuote(`tmux session not found: ${sessionName}`);
  const attachCommand = quotedWindow
    ? `exec tmux attach-session -t ${quotedSession} \\; select-window -t ${quotedWindow};`
    : `exec tmux attach-session -t ${quotedSession};`;

  return [
    "attempts=0;",
    "while [ \"$attempts\" -lt 20 ]; do",
    `  if tmux has-session -t ${quotedSession} 2>/dev/null; then`,
    `    ${attachCommand}`,
    "  fi;",
    "  attempts=$((attempts + 1));",
    "  sleep 0.1;",
    "done;",
    `printf '%s\\n' ${missingMessage};`,
    "exec zsh -i;",
  ].join(" ");
}
