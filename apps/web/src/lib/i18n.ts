/**
 * Minimal translation for the key screens (navigation, sign-in and sign-up, dashboard).
 * Strings are keyed by their English text, so untranslated text falls back to English.
 * Switching language reloads the page; the choice is kept per browser.
 */
export type Locale = 'en' | 'fil';
const KEY = 'licitatio.locale';

function readLocale(): Locale {
  try { return localStorage.getItem(KEY) === 'fil' ? 'fil' : 'en'; } catch { return 'en'; }
}

export const locale: Locale = readLocale();
if (typeof document !== 'undefined') document.documentElement.lang = locale === 'fil' ? 'fil' : 'en';

export function setLocale(next: Locale): void {
  try { localStorage.setItem(KEY, next); } catch { /* private mode: keep English */ }
  window.location.reload();
}

const FIL: Record<string, string> = {
  // navigation and shell
  'Dashboard': 'Dashboard',
  'Bids': 'Mga bid',
  'Proposals': 'Mga panukala',
  'Tasks': 'Mga gawain',
  'Outcomes': 'Mga resulta',
  'Document vault': 'Imbakan ng dokumento',
  'Experience': 'Karanasan',
  'Personnel': 'Mga tauhan',
  'Equipment': 'Kagamitan',
  'Settings': 'Mga setting',
  'Sign out': 'Mag-sign out',
  'Notifications': 'Mga abiso',
  'Mark all read': 'Markahang nabasa lahat',
  'You are all caught up.': 'Wala kang bagong abiso.',
  'Skip to content': 'Lumaktaw sa nilalaman',
  'Menu': 'Menu',
  'Language': 'Wika',
  // auth
  'Sign in': 'Mag-sign in',
  'New to Licitatio? ': 'Bago sa Licitatio? ',
  'Create an account': 'Gumawa ng account',
  'Email': 'Email',
  'Password': 'Password',
  'Authenticator code': 'Code mula sa authenticator',
  'Signing in as Semivra staff?': 'Nagsa-sign in bilang staff ng Semivra?',
  'Forgot your password?': 'Nakalimutan ang password?',
  'Verify your email first. ': 'I-verify muna ang iyong email. ',
  'Resend the link': 'Ipadala muli ang link',
  'Create your workspace': 'Gumawa ng iyong workspace',
  'Your company starts with a 14-day trial.': 'Magsisimula ang iyong kumpanya sa 14 na araw na trial.',
  'Already have an account? ': 'May account ka na? ',
  'Your name': 'Iyong pangalan',
  'Work email': 'Email sa trabaho',
  'Company name': 'Pangalan ng kumpanya',
  'Company type': 'Uri ng kumpanya',
  'Create account': 'Gumawa ng account',
  'Check your email': 'Tingnan ang iyong email',
  'Back to sign in': 'Bumalik sa pag-sign in',
  'Reset your password': 'I-reset ang iyong password',
  'Send reset link': 'Ipadala ang reset link',
  'If an account uses that email, we sent a reset link. It expires in 1 hour.': 'Kung may account na gumagamit ng email na iyon, nagpadala kami ng reset link. Mag-e-expire ito sa loob ng 1 oras.',
  'Choose a new password': 'Pumili ng bagong password',
  'New password': 'Bagong password',
  'Confirm password': 'Kumpirmahin ang password',
  'Update password': 'I-update ang password',
  'Password updated': 'Na-update ang password',
  'You were signed out on every device.': 'Na-sign out ka sa lahat ng device.',
  'Email verified': 'Na-verify ang email',
  'Your account is ready.': 'Handa na ang iyong account.',
  'Join your team': 'Sumali sa iyong team',
  'Accept invitation': 'Tanggapin ang imbitasyon',
  // dashboard
  'Expired': 'Expired na',
  'Expiring soon': 'Malapit nang mag-expire',
  'Valid': 'Valid',
  'No expiry': 'Walang expiry',
  'Ready bids with new blockers': 'Handang bid na may bagong hadlang',
  'My open tasks': 'Aking mga bukas na gawain',
  'Next deadlines': 'Mga susunod na deadline',
  'No upcoming deadlines': 'Walang paparating na deadline',
  'Go to bids': 'Pumunta sa mga bid',
  'Needs attention': 'Kailangang asikasuhin',
  'Nothing is expired or expiring': 'Walang expired o malapit nang mag-expire',
  'Company profile': 'Profile ng kumpanya',
  'Complete. Exports can use your company details.': 'Kumpleto na. Magagamit ng mga export ang detalye ng iyong kumpanya.',
  'Exports need these fields:': 'Kailangan ng mga export ang mga field na ito:',
  'Complete the profile': 'Kumpletuhin ang profile',
};

export function t(en: string): string {
  return locale === 'fil' ? FIL[en] ?? en : en;
}

export const translatedKeys = (): string[] => Object.keys(FIL);
