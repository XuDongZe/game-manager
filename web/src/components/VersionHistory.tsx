import { useState } from 'react';
import { Version } from '../types';
import LogViewer from './LogViewer';

interface VersionHistoryProps {
  gameId: string;
  versions: Version[];
  onRefresh: () => void;
}

export default function VersionHistory({ gameId, versions, onRefresh }: VersionHistoryProps) {
  const [rollbackVersion, setRollbackVersion] = useState<number | null>(null);

  const handleRollback = (version: number) => {
    if (confirm(`确定要回滚到版本 ${version} 吗？`)) {
      setRollbackVersion(version);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live': return 'var(--success-color)';
      case 'failed': return 'var(--danger-color)';
      case 'rolled_back': return '#9ca3af';
      case 'deploying': return 'var(--warning-color)';
      default: return 'inherit';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'live': return '运行中';
      case 'failed': return '失败';
      case 'rolled_back': return '已回滚';
      case 'deploying': return '部署中';
      default: return status;
    }
  };

  return (
    <div style={{ marginTop: '24px' }}>
      <h3 style={{ marginBottom: '16px' }}>版本历史</h3>
      
      {rollbackVersion !== null && (
        <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <h4>正在回滚到版本 {rollbackVersion}...</h4>
          <div style={{ marginTop: '12px' }}>
            <LogViewer 
              url={`/api/deploy/${gameId}/rollback`}
              method="POST"
              body={JSON.stringify({ version: rollbackVersion, operatorId: 'sys_ui' })}
              onComplete={(_msg) => {
                alert('回滚成功');
                setRollbackVersion(null);
                onRefresh();
              }}
              onError={(err) => {
                alert(`回滚失败: ${err}`);
                setRollbackVersion(null);
              }}
            />
          </div>
          <button 
            style={{ marginTop: '12px', padding: '8px 16px', background: 'var(--danger-color)', color: '#fff', borderRadius: '4px' }}
            onClick={() => setRollbackVersion(null)}
          >
            关闭并取消预览
          </button>
        </div>
      )}

      <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '12px 16px' }}>版本号</th>
              <th style={{ padding: '12px 16px' }}>Git Tag</th>
              <th style={{ padding: '12px 16px' }}>状态</th>
              <th style={{ padding: '12px 16px' }}>部署人</th>
              <th style={{ padding: '12px 16px' }}>部署时间</th>
              <th style={{ padding: '12px 16px' }}>大小 (KB)</th>
              <th style={{ padding: '12px 16px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '12px 16px' }}>v{v.version_num} {!!v.is_rollback && '(回滚)'}</td>
                <td style={{ padding: '12px 16px' }}>{v.git_tag || '-'}</td>
                <td style={{ padding: '12px 16px', color: getStatusColor(v.status), fontWeight: 'bold' }}>
                  {getStatusLabel(v.status)}
                </td>
                <td style={{ padding: '12px 16px' }}>{v.deployed_by}</td>
                <td style={{ padding: '12px 16px' }}>{new Date(v.deployed_at).toLocaleString()}</td>
                <td style={{ padding: '12px 16px' }}>{v.file_size_kb || '-'}</td>
                <td style={{ padding: '12px 16px' }}>
                  {v.status !== 'live' && v.status !== 'deploying' && (
                    <button 
                      onClick={() => handleRollback(v.version_num)}
                      style={{ padding: '6px 12px', background: 'var(--primary-color)', color: '#fff', borderRadius: '4px', fontSize: '14px' }}
                    >
                      回滚至此版本
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {versions.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                  暂无版本历史
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}