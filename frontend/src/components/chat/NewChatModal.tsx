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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto animate-scale-in">
        <h2 className="text-lg font-bold text-gray-900 mb-4">新建对话</h2>

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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              对话标题
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="例如：项目文档问答"
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 选择知识库 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择知识库（可多选）
            </label>
            <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {kbOptions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  暂无可用知识库，请先创建知识库并上传文档
                </p>
              ) : (
                kbOptions.map((kb) => (
                  <label
                    key={kb.id}
                    className="flex items-center gap-2.5 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedKbs.includes(kb.id)}
                      onChange={() => onKbToggle(kb.id)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{kb.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={onCreate}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
