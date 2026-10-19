import fs from 'fs';
import path from 'path';
import { CalcResult } from './calc';

const fmt = (n: number | null | undefined, d = 2): string =>
    n === null || n === undefined
        ? '-'
        : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export function buildMarkdownReport(result: CalcResult, startDay: string, endDay: string): string {
    let md = `# Beets protocol fees per pool - Sonic\n\n`;
    md += `Period: ${startDay} .. ${endDay} (UTC, end exclusive)  \nBlocks: ${result.fromBlock} .. ${result.toBlock}  \n`;
    md += `Accounting: fees counted when withdrawn by Mimic, priced at the withdrawal block.\n\n`;
    md += `| Pool | Version | Protocol fees (USD) | Share |\n|---|---|---:|---:|\n`;
    for (const p of [...result.pools].sort((a, b) => b.usd - a.usd)) {
        md += `| ${p.symbol ?? p.address} | v${p.version} | ${fmt(p.usd)} | ${fmt(p.sharePct)}% |\n`;
    }
    md += `| **Total** | | **${fmt(result.totalUsd)}** | 100.00% |\n\n`;
    md += `## Breakdown by token (withdrawals from fee collector / controller)\n\n`;
    md += `| Pool | Fee type | Token | Amount | USD | Withdrawals |\n|---|---|---|---:|---:|---:|\n`;
    for (const p of result.pools) {
        for (const t of p.tokens) {
            md += `| ${p.symbol ?? p.address} | ${t.feeType} | ${t.token} | ${fmt(t.amount, 6)} | ${fmt(t.usd)} | ${t.events} |\n`;
        }
    }
    if (result.warnings.length) {
        md += `\n## Warnings\n\n${result.warnings.map((w) => `- ${w}`).join('\n')}\n`;
    }
    return md;
}

export function buildSummaryCsv(result: CalcResult): string {
    let csv = 'pool_id,pool_address,symbol,version,protocol_fee_usd,share_pct,event_count,unpriced_events\n';
    for (const p of result.pools) {
        csv += `${p.poolId},${p.address},"${p.symbol ?? ''}",${p.version},${p.usd.toFixed(6)},${p.sharePct.toFixed(
            4,
        )},${p.eventCount},${p.unpricedEvents}\n`;
    }
    return csv;
}

export function buildEventsCsv(result: CalcResult): string {
    let csv = 'pool_id,symbol,fee_type,timestamp,datetime_utc,block,tx_hash,token,recipient,amount,price_usd,usd\n';
    for (const p of result.pools) {
        for (const e of p.events) {
            csv += `${p.poolId},"${p.symbol ?? ''}",${e.feeType},${e.ts},${new Date(e.ts * 1000).toISOString()},${
                e.blockNumber
            },${e.txHash},${e.token},${e.recipient},${e.amount},${e.price ?? ''},${e.usd ?? ''}\n`;
        }
    }
    return csv;
}

export function buildResultJson(result: CalcResult): string {
    const withoutEvents = { ...result, pools: result.pools.map((p) => ({ ...p, events: undefined })) };
    return JSON.stringify(withoutEvents, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

/** Writes report.md, summary.csv, events.csv and result.json into outDir. */
export function writeReportFiles(result: CalcResult, outDir: string, startDay: string, endDay: string): void {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'report.md'), buildMarkdownReport(result, startDay, endDay));
    fs.writeFileSync(path.join(outDir, 'summary.csv'), buildSummaryCsv(result));
    fs.writeFileSync(path.join(outDir, 'events.csv'), buildEventsCsv(result));
    fs.writeFileSync(path.join(outDir, 'result.json'), buildResultJson(result));
}
