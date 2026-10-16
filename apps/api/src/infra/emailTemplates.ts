import { env } from '../config/env';
import { escapeHtml } from './mailer';
import type { MailMessage } from './mailer';

type Template = Omit<MailMessage, 'to'>;

const link = (path: string): string => `${env.APP_URL}${path}`;

function layout(title: string, paragraphs: string[], action?: { label: string; href: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:20px 0"><a href="${escapeHtml(action.href)}" style="background:#1d4ed8;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(action.label)}</a></p>`
    : '';
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111;max-width:560px"><h2 style="font-size:18px">${escapeHtml(title)}</h2>${body}${button}<p style="color:#666;font-size:12px">Licitatio</p></div>`;
}

export function verifyEmail(name: string, token: string): Template {
  const href = link(`/verify-email?token=${token}`);
  return {
    subject: 'Verify your email for Licitatio',
    text: `Hi ${name},\n\nConfirm your email address to finish setting up your account:\n${href}\n\nThe link expires in 24 hours.`,
    html: layout('Verify your email', [`Hi ${name},`, 'Confirm your email address to finish setting up your account. The link expires in 24 hours.'], { label: 'Verify email', href }),
  };
}

export function accountExists(): Template {
  const href = link('/forgot-password');
  return {
    subject: 'Someone tried to register with your email',
    text: `An account with this email already exists. If this was you, sign in or reset your password:\n${href}\n\nIf it was not you, you can ignore this message.`,
    html: layout('You already have an account', ['An account with this email already exists. If this was you, sign in or reset your password. If it was not you, ignore this message.'], { label: 'Reset password', href }),
  };
}

export function resetPassword(name: string, token: string): Template {
  const href = link(`/reset-password?token=${token}`);
  return {
    subject: 'Reset your Licitatio password',
    text: `Hi ${name},\n\nReset your password with this link:\n${href}\n\nThe link expires in 1 hour. If you did not ask for this, ignore this message.`,
    html: layout('Reset your password', [`Hi ${name},`, 'The link expires in 1 hour. If you did not ask for this, ignore this message.'], { label: 'Reset password', href }),
  };
}

export function staffSetup(name: string, token: string): Template {
  const href = link(`/reset-password?token=${token}`);
  return {
    subject: 'Set up your Licitatio staff account',
    text: `Hi ${name},\n\nSet your password with this link:\n${href}`,
    html: layout('Set up your staff account', [`Hi ${name},`, 'Set your password with the link below.'], { label: 'Set password', href }),
  };
}

export function invite(orgName: string, inviterName: string, role: string, token: string): Template {
  const href = link(`/accept-invite?token=${token}`);
  return {
    subject: `${inviterName} invited you to ${orgName} on Licitatio`,
    text: `${inviterName} invited you to join ${orgName} as ${role}.\n\nAccept the invitation:\n${href}\n\nThe link expires in 7 days.`,
    html: layout(`Join ${orgName}`, [`${inviterName} invited you to join ${orgName} as ${role}.`, 'The link expires in 7 days.'], { label: 'Accept invitation', href }),
  };
}

export function staffGrantNotice(orgName: string, staffName: string, action: 'granted' | 'revoked', expiresAt?: Date): Template {
  const sentence = action === 'granted'
    ? `Semivra staff member ${staffName} now has editor access to ${orgName} until ${expiresAt?.toISOString().slice(0, 10) ?? ''}. Their actions are recorded in your audit log.`
    : `Staff access for ${staffName} to ${orgName} was revoked.`;
  return {
    subject: `Staff access ${action}: ${orgName}`,
    text: sentence,
    html: layout(`Staff access ${action}`, [sentence], { label: 'Review staff access', href: link('/') }),
  };
}

export interface DigestItem {
  title: string;
  body: string;
  link: string;
}

export function digest(name: string, groups: Array<{ orgName: string; items: DigestItem[] }>): Template {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const text = [
    `Hi ${name},`,
    '',
    ...groups.flatMap((g) => [`${g.orgName}`, ...g.items.map((i) => `- ${i.title}: ${link(i.link)}`), '']),
  ].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111;max-width:560px"><h2 style="font-size:18px">${total} update${total === 1 ? '' : 's'} need your attention</h2>${groups
    .map(
      (g) =>
        `<h3 style="font-size:15px;margin:16px 0 6px">${escapeHtml(g.orgName)}</h3><ul style="padding-left:18px">${g.items
          .map((i) => `<li style="margin-bottom:6px"><a href="${escapeHtml(link(i.link))}">${escapeHtml(i.title)}</a><br><span style="color:#555">${escapeHtml(i.body)}</span></li>`)
          .join('')}</ul>`,
    )
    .join('')}<p style="color:#666;font-size:12px">You receive this daily digest because reminders are on. Change it in notification settings.</p></div>`;
  return { subject: `Licitatio: ${total} update${total === 1 ? '' : 's'} for your bids`, text, html };
}
