import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Loader2, Sparkles } from 'lucide-react';
import {
  useCancelPlanMutation,
  useGetBillingQuery,
  useStartCheckoutMutation,
  useVerifyCheckoutMutation,
} from '../features/billing/billingApi.js';
import { TIERS, formatPrice, monthlyPrice } from '../lib/pricing.js';
import { getErrorMessage } from '../lib/errors.js';
import { formatDate } from '../lib/format.js';

function Meter({ label, used, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 100;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>
          {used} of {max}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${pct >= 90 ? 'bg-amber-400' : 'bg-cyan-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function Billing() {
  const { data, isLoading, isError, error } = useGetBillingQuery();
  const [startCheckout] = useStartCheckoutMutation();
  const [verify] = useVerifyCheckoutMutation();
  const [cancel, cancelling] = useCancelPlanMutation();
  const [params, setParams] = useSearchParams();
  const [annual, setAnnual] = useState(params.get('interval') !== 'monthly');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const checked = useRef(false);

  // Back from Paystack: ask the server to confirm the payment with Paystack. The address alone proves nothing.
  const reference = params.get('reference');
  useEffect(() => {
    if (!reference || checked.current) return;
    checked.current = true;
    verify(reference)
      .unwrap()
      .then(() => setNotice('Payment confirmed. Your plan is active.'))
      .catch((err) => setProblem(getErrorMessage(err)))
      .finally(() => setParams({}, { replace: true }));
  }, [reference, verify, setParams]);

  const upgrade = async (tier) => {
    setProblem('');
    setBusy(tier);
    try {
      const res = await startCheckout({
        tier,
        interval: annual ? 'annual' : 'monthly',
      }).unwrap();
      window.location.assign(res.url);
    } catch (err) {
      setProblem(getErrorMessage(err));
      setBusy('');
    }
  };

  const doCancel = async () => {
    if (!window.confirm('Cancel your plan? You keep it until the end of the period you already paid for.')) return;
    setProblem('');
    try {
      await cancel().unwrap();
      setNotice('Cancelled. You keep your plan until the end of the paid period.');
    } catch (err) {
      setProblem(getErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
      </div>
    );
  }
  if (isError) return <p className="text-sm text-red-400">{getErrorMessage(error)}</p>;

  const { plan, usage, billingEnabled, checkoutReady } = data;
  const paid = plan.source === 'paid';
  const wanted = params.get('plan');

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-white">Plan and billing</h1>
      <p className="mt-1 text-sm text-slate-400">
        Prices are in US dollars. Payments are handled by Paystack. We never see your card.
      </p>

      {notice && (
        <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {notice}
        </p>
      )}
      {problem && (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{problem}</p>
      )}

      {!billingEnabled && (
        <p className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">
          <Sparkles className="mr-1.5 inline h-4 w-4" />
          Early access: every feature is unlocked for now, at no cost. Paid plans will start later.
        </p>
      )}

      <div className="card mt-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Your plan</p>
            <p className="mt-1 text-xl font-semibold text-white">
              {plan.name}
              {paid && plan.interval && (
                <span className="ml-2 text-sm font-normal text-slate-400">
                  {plan.interval === 'annual' ? 'billed yearly' : 'billed monthly'}
                </span>
              )}
            </p>
            {paid && (
              <p className="mt-1 text-sm text-slate-400">
                {plan.renews
                  ? `Renews around ${formatDate(plan.periodEnd)}`
                  : `Ends ${formatDate(plan.periodEnd)}. It will not renew`}
                {plan.status === 'attention' && ' · the last payment did not go through, please check your card'}
              </p>
            )}
          </div>
          {paid && plan.renews && (
            <button className="btn-ghost" onClick={doCancel} disabled={cancelling.isLoading}>
              {cancelling.isLoading && <Loader2 className="h-4 w-4 animate-spin" />} Cancel plan
            </button>
          )}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Meter label="Scans this month" used={usage.scans} max={plan.limits.scansPerMonth} />
          <Meter label="Watched repositories" used={usage.watches} max={plan.limits.watches} />
          <Meter label="API tokens" used={usage.tokens} max={plan.limits.tokens} />
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <div className="inline-flex rounded-full border border-slate-800 bg-slate-900 p-1 text-sm">
          {[
            ['Monthly', false],
            ['Yearly (20% off)', true],
          ].map(([label, value]) => (
            <button
              key={label}
              onClick={() => setAnnual(value)}
              aria-pressed={annual === value}
              className={`rounded-full px-5 py-1.5 font-medium ${annual === value ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/40' : 'text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {TIERS.map((t) => {
          const current =
            plan.key === t.key &&
            (t.key === 'free' ||
              (plan.source === 'paid' && plan.renews && plan.interval === (annual ? 'annual' : 'monthly')));
          return (
            <div key={t.key} className={`card flex flex-col p-6 ${wanted === t.key ? 'ring-1 ring-cyan-400/60' : ''}`}>
              <h3 className="text-lg font-semibold text-white">{t.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{t.tagline}</p>
              <p className="mt-5 text-white">
                <span className="text-2xl">$</span>
                <span className="text-4xl font-semibold">{formatPrice(monthlyPrice(t, annual))}</span>
                <span className="text-sm text-slate-400"> /month</span>
              </p>
              <p className="mt-1 min-h-[1rem] text-xs text-slate-500">
                {t.monthly > 0 && (annual ? `Billed $${t.annual} per year` : 'Billed monthly')}
              </p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" /> {f}
                  </li>
                ))}
              </ul>
              {t.key === 'free' ? (
                <button className="btn-ghost mt-6 w-full" disabled>
                  {plan.key === 'free' ? 'Your current plan' : 'Free forever'}
                </button>
              ) : (
                <button
                  className="btn-primary mt-6 w-full"
                  disabled={current || !billingEnabled || !checkoutReady || Boolean(busy)}
                  onClick={() => upgrade(t.key)}
                >
                  {busy === t.key && <Loader2 className="h-4 w-4 animate-spin" />}
                  {current
                    ? 'Your current plan'
                    : plan.key === 'free' || plan.source !== 'paid'
                      ? `Upgrade to ${t.name}`
                      : `Switch to ${t.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {billingEnabled && !checkoutReady && (
        <p className="mt-4 text-sm text-slate-500">Payments are being set up. Please check back soon.</p>
      )}
      {paid && (
        <p className="mt-4 text-xs text-slate-500">
          Switching plans starts a new subscription. Cancel the old one above so you are not charged twice.
        </p>
      )}
    </div>
  );
}
