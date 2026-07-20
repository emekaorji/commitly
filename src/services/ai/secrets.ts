import type * as vscode from 'vscode';

export const GROQ_KEY_SECRET = 'commitly.groqApiKey';

export async function getGroqKey(
  secrets: vscode.SecretStorage
): Promise<string | undefined> {
  const v = await secrets.get(GROQ_KEY_SECRET);
  return v && v.trim() ? v.trim() : undefined;
}

export async function setGroqKey(
  secrets: vscode.SecretStorage,
  value: string
): Promise<void> {
  await secrets.store(GROQ_KEY_SECRET, value.trim());
}

export async function clearGroqKey(
  secrets: vscode.SecretStorage
): Promise<void> {
  await secrets.delete(GROQ_KEY_SECRET);
}
