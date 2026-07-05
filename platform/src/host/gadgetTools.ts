import type { GadgetAiTool } from 'gadget-sdk'

// 案内AI（ADR-011）が呼べるガジェットのツール登録簿。
// 棚に開いている（＝GadgetFrame がマウント済みで、aiTools 宣言＋permission 'ai-tools' 承認済みの）
// ガジェットだけが登録される。案内AIはここを見て「今操作できる道具」を把握し、invoke で実行する。

export interface RegisteredGadget {
  gadgetDir: string
  /** 表示名（manifest.name） */
  name: string
  tools: GadgetAiTool[]
  invoke: (tool: string, args: Record<string, unknown>) => Promise<unknown>
}

const registry = new Map<string, RegisteredGadget>()

export function registerGadgetTools(entry: RegisteredGadget): void {
  registry.set(entry.gadgetDir, entry)
}

export function unregisterGadgetTools(gadgetDir: string): void {
  registry.delete(gadgetDir)
}

export function listRegisteredGadgets(): RegisteredGadget[] {
  return [...registry.values()]
}

/** ツール定義（案内AIのプロンプトに渡す軽量な形） */
export function toolCatalog(): Array<{
  gadget: string
  gadgetName: string
  name: string
  description: string
  kind: 'read' | 'act'
}> {
  const out: Array<{ gadget: string; gadgetName: string; name: string; description: string; kind: 'read' | 'act' }> = []
  for (const g of registry.values()) {
    for (const t of g.tools) {
      out.push({ gadget: g.gadgetDir, gadgetName: g.name, name: t.name, description: t.description, kind: t.kind })
    }
  }
  return out
}

/** 特定ツールの定義を引く（kind 判定・存在確認用） */
export function findTool(gadgetDir: string, tool: string): GadgetAiTool | null {
  return registry.get(gadgetDir)?.tools.find((t) => t.name === tool) ?? null
}

export async function invokeGadgetTool(
  gadgetDir: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const entry = registry.get(gadgetDir)
  if (!entry) throw new Error(`ガジェット「${gadgetDir}」は今開いていません`)
  if (!entry.tools.some((t) => t.name === tool)) {
    throw new Error(`ツール「${tool}」は宣言されていません`)
  }
  return entry.invoke(tool, args)
}
