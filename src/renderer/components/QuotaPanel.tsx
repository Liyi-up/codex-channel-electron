import { LogIn, RefreshCw, Wallet } from 'lucide-react';
import type { QuotaView } from '../types';
import ActionButton from './ActionButton';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';

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
    <Card className="panel-scroll h-full min-h-0 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <CardHeader className="space-y-1 p-0">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-textSub" />
            FoxCode 额度
          </CardTitle>
          <CardDescription>登录后可获取并展示最新额度数据。</CardDescription>
        </CardHeader>
        <div className="flex items-center gap-2">
          {showFoxLogin ? (
            <ActionButton
              variant="default"
              size="sm"
              label="打开登录页"
              busyText="打开中..."
              loading={isBusy('login')}
              icon={LogIn}
              onClick={onOpenFoxLogin}
            />
          ) : null}
          <ActionButton
            variant="secondary"
            size="sm"
            label="获取额度"
            busyText="获取中..."
            loading={isBusy('quota')}
            icon={RefreshCw}
            onClick={onFetchQuota}
          />
        </div>
      </div>

      <p className="hint-box mb-3 rounded-lg border border-border/70 px-3 py-2 text-xs text-textSub">{envHint}</p>

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

      <section className="meta-box mt-4 rounded-xl border border-border/80 p-3 text-xs text-textSub">
        <p>
          账号：<span>{quota.username}</span>
        </p>
        <p className="mt-1">
          更新时间：<span>{quota.updatedAt}</span>
        </p>
        <p className="mt-1">{quota.meta}</p>
      </section>
    </Card>
  );
}

export default QuotaPanel;
