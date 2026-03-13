import * as vscode from "vscode";
import type { LocalStory, LocalStoryReader } from "../local/local-story-reader";

export const AGENT_DECORATION_SCHEME = "workspace-issue";

export function issueUri(key: string): vscode.Uri {
  return vscode.Uri.parse(`${AGENT_DECORATION_SCHEME}:///${key}`);
}

function storyQueue(story: LocalStory): string {
  return story.workStatus || story.queue;
}

/**
 * Badge: 1-2 chars — initials of assignee, or queue letter when unassigned.
 * Displayed on the right side of tree items (same mechanism as git status dots).
 */
function badge(story: LocalStory): string {
  if (story.assignee) {
    const parts = story.assignee.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : story.assignee.slice(0, 2).toUpperCase();
  }
  // No assignee — show queue state letter
  switch (storyQueue(story)) {
    case "active": return "▸";
    case "blocked": return "!";
    case "review": return "R";
    case "done": return "✓";
    default: return "·";
  }
}

/**
 * Color mirrors git decoration colors so badges blend naturally with the
 * file explorer's existing visual language.
 */
function queueColor(queue: string): vscode.ThemeColor {
  switch (queue) {
    case "active":
      return new vscode.ThemeColor("gitDecoration.modifiedResourceForeground");
    case "blocked":
      return new vscode.ThemeColor("gitDecoration.deletedResourceForeground");
    case "review":
      return new vscode.ThemeColor("gitDecoration.untrackedResourceForeground");
    case "done":
      return new vscode.ThemeColor("gitDecoration.addedResourceForeground");
    default:
      return new vscode.ThemeColor("gitDecoration.ignoredResourceForeground");
  }
}

function tooltip(story: LocalStory): string {
  const parts = [storyQueue(story), story.status];
  if (story.assignee) parts.unshift(story.assignee);
  if (story.syncedAt) parts.push(`synced ${new Date(story.syncedAt).toLocaleTimeString()}`);
  return parts.join(" · ");
}

/**
 * AgentDecorationProvider reads ONLY from local $WORK_STORIES_ROOT snapshots.
 * No Jira API calls. Watches for file changes and refreshes badges live.
 */
export class AgentDecorationProvider
  implements vscode.FileDecorationProvider, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  private readonly cache = new Map<string, LocalStory>();
  private watcher: vscode.Disposable | undefined;

  constructor(private readonly reader: LocalStoryReader) {
    this.reloadAll();
  }

  /** Start watching story files for live badge updates. */
  startWatching(): void {
    this.watcher?.dispose();
    this.watcher = this.reader.watch((key) => this.reloadOne(key));
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== AGENT_DECORATION_SCHEME) return undefined;
    const key = uri.path.replace(/^\//, "");
    const story = this.cache.get(key);
    if (!story) return undefined;
    return new vscode.FileDecoration(badge(story), tooltip(story), queueColor(storyQueue(story)));
  }

  dispose(): void {
    this.watcher?.dispose();
    this._onDidChange.dispose();
  }

  private reloadAll(): void {
    this.cache.clear();
    const stories = this.reader.readAll();
    for (const s of stories) this.cache.set(s.key, s);
    if (stories.length > 0) {
      this._onDidChange.fire(stories.map((s) => issueUri(s.key)));
    }
  }

  private reloadOne(key: string): void {
    const story = this.reader.read(key);
    if (story) {
      this.cache.set(key, story);
    } else {
      this.cache.delete(key);
    }
    this._onDidChange.fire([issueUri(key)]);
  }
}
