/**
 * @fileoverview 新建对话弹窗组件
 * @description 创建新对话的表单弹窗，支持选择关联的知识库
 */

interface KbOption {
  id: number;
  name: string;
}

interface NewChatModalProps {
  /** 是否显示弹窗 */
  visible: boolean;
  /** 对话标题 */
  title: string;
  /** 设置对话标题 */
  onTitleChange: (title: string) => void;
  /** 已选中的知识库 ID 列表 */
  selectedKbs: number[];
  /** 切换知识库选中状态 */
  onKbToggle: (kbId: number) => void;
  /** 可选的知识库列表 */
  kbOptions: KbOption[];
  /** 表单错误信息 */
  error: string;
  /** 是否正在创建 */
  loading: boolean;
  /** 点击创建按钮 */
  onCreate: () => void;
  /** 点击取消按钮 */
  onCancel: () => void;
}

/**
 * 新建对话弹窗组件
 */
export function NewChatModal({
  visible,
  title,
  onTitleChange,
  selectedKbs,
  onKbToggle,
  kbOptions,
  error,
  loading,
  onCreate,
  onCancel,
}: NewChatModalProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md animate-scale-in overflow-y-auto rounded-xl bg-surface p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-ink">新建对话</h2>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* 表单内容 */}
        <div className="space-y-4">
          {/* 对话标题 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              对话标题{" "}
              <span className="font-normal text-muted">（可选）</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="留空则自动命名为「新对话 · 月/日 时:分」"
              className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <p className="mt-1.5 text-[11px] text-muted">
              填写后将作为列表中显示的名称；不填则由系统按时间生成，便于区分多条「新对话」。
            </p>
          </div>

          {/* 选择知识库 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">
              选择知识库（可多选）
            </label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {kbOptions.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">
                  暂无可用知识库，请先创建知识库并上传文档
                </p>
              ) : (
                kbOptions.map((kb) => (
                  <label
                    key={kb.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selectedKbs.includes(kb.id)}
                      onChange={() => onKbToggle(kb.id)}
                      className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <span className="text-sm text-ink">{kb.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:bg-surface-muted"
          >
            取消
          </button>
          <button
            onClick={onCreate}
            disabled={loading}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
