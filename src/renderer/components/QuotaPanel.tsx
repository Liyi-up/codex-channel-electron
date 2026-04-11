import type { QuotaView } from '../types';
import ActionButton from './ActionButton';

type QuotaPanelProps = {
  envHint: string;
  showFoxLogin: boolean;
  quota: QuotaView;
  isBusy: (key: string) => boolean;
  onOpenFoxLogin: () => void;
  onFetchQuota: () => void;
};

function QuotaPanel(props: QuotaPanelProps) {
  const { envHint, showFoxLogin, quota, isBusy, onOpenFoxLogin, onFetchQuota } = props;

  return (
    <section className="panel panel-scroll rounded-2xl border border-border/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">FoxCode 额度</h2>
          <p className="mt-1 text-xs text-textSub">登录后可获取并展示最新额度数据。</p>
        </div>
        <div className="flex items-center gap-2">
          {showFoxLogin ? (
            <ActionButton
              className="btn btn-default"
              label="打开登录页"
              busyText="打开中..."
              loading={isBusy('login')}
              onClick={onOpenFoxLogin}
            />
          ) : null}
          <ActionButton
            className="btn btn-neutral"
            label="获取额度"
            busyText="获取中..."
            loading={isBusy('quota')}
            onClick={onFetchQuota}
          />
        </div>
      </div>

      <p className="mb-3 rounded-lg border border-border/70 bg-black/25 px-3 py-2 text-xs text-textSub">{envHint}</p>

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <article className="quota-card quota-card-total">
          <p className="quota-title">按量额度</p>
          <p className="quota-value">{quota.total}</p>
        </article>
        <article className="quota-card quota-card-month">
          <p className="quota-title">月卡额度</p>
          <p className="quota-value">{quota.month}</p>
        </article>
      </section>

      <section className="mt-4 rounded-xl border border-border/80 bg-black/20 p-3 text-xs text-textSub">
        <p>
          账号：<span>{quota.username}</span>
        </p>
        <p className="mt-1">
          更新时间：<span>{quota.updatedAt}</span>
        </p>
        <p className="mt-1">{quota.meta}</p>
      </section>
    </section>
  );
}

export default QuotaPanel;
