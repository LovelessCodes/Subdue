export type SeedPaymentMethod = { name: string; icon: string | null }
export type SeedCategory = { name: string; color: string }

export type SeedSet = {
  paymentMethods: SeedPaymentMethod[]
  categories: SeedCategory[]
}

const VISA: SeedPaymentMethod = { name: 'Visa', icon: '/brands/visa.svg' }
const MASTERCARD: SeedPaymentMethod = {
  name: 'MasterCard',
  icon: '/brands/mastercard.svg',
}

// Brand names are proper nouns and stay as they are — the cards, and the local
// app where a language has one — while the descriptive methods and the category
// names are translated. An app is only added where it is the everyday way
// people pay: nobody is handed a service they have never heard of.
const SEED_SETS: Record<string, SeedSet> = {
  en: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Debit card', icon: '/brands/debit.svg' },
      { name: 'Bank transfer', icon: null },
    ],
    categories: [
      { name: 'Entertainment', color: '#7c3aed' },
      { name: 'Utilities', color: '#0369a1' },
      { name: 'Software', color: '#0f766e' },
      { name: 'Housing', color: '#b45309' },
      { name: 'Subscriptions', color: '#be123c' },
    ],
  },
  de: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'EC-Karte', icon: '/brands/debit.svg' },
      { name: 'Überweisung', icon: null },
    ],
    categories: [
      { name: 'Unterhaltung', color: '#7c3aed' },
      { name: 'Nebenkosten', color: '#0369a1' },
      { name: 'Software', color: '#0f766e' },
      { name: 'Wohnen', color: '#b45309' },
      { name: 'Abonnements', color: '#be123c' },
    ],
  },
  zh: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: '借记卡', icon: '/brands/debit.svg' },
      { name: '支付宝', icon: '/brands/qr-pay.svg' },
      { name: '微信支付', icon: '/brands/qr-pay.svg' },
      { name: '银行转账', icon: null },
    ],
    categories: [
      { name: '娱乐', color: '#7c3aed' },
      { name: '水电杂费', color: '#0369a1' },
      { name: '软件', color: '#0f766e' },
      { name: '住房', color: '#b45309' },
      { name: '订阅', color: '#be123c' },
    ],
  },
  da: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Debetkort', icon: '/brands/debit.svg' },
      { name: 'MobilePay', icon: '/brands/wallet.svg' },
      { name: 'Bankoverførsel', icon: null },
    ],
    categories: [
      { name: 'Underholdning', color: '#7c3aed' },
      { name: 'Forsyninger', color: '#0369a1' },
      { name: 'Software', color: '#0f766e' },
      { name: 'Bolig', color: '#b45309' },
      { name: 'Abonnementer', color: '#be123c' },
    ],
  },
  fr: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Carte de débit', icon: '/brands/debit.svg' },
      { name: 'Virement bancaire', icon: null },
    ],
    categories: [
      { name: 'Divertissement', color: '#7c3aed' },
      { name: 'Charges', color: '#0369a1' },
      { name: 'Logiciels', color: '#0f766e' },
      { name: 'Logement', color: '#b45309' },
      { name: 'Abonnements', color: '#be123c' },
    ],
  },
  sv: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Betalkort', icon: '/brands/debit.svg' },
      { name: 'Swish', icon: '/brands/wallet.svg' },
      { name: 'Banköverföring', icon: null },
    ],
    categories: [
      { name: 'Underhållning', color: '#7c3aed' },
      { name: 'Hushållskostnader', color: '#0369a1' },
      { name: 'Programvara', color: '#0f766e' },
      { name: 'Boende', color: '#b45309' },
      { name: 'Prenumerationer', color: '#be123c' },
    ],
  },
  nb: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Debetkort', icon: '/brands/debit.svg' },
      { name: 'Vipps', icon: '/brands/wallet.svg' },
      { name: 'Bankoverføring', icon: null },
    ],
    categories: [
      { name: 'Underholdning', color: '#7c3aed' },
      { name: 'Nyttetjenester', color: '#0369a1' },
      { name: 'Programvare', color: '#0f766e' },
      { name: 'Bolig', color: '#b45309' },
      { name: 'Abonnementer', color: '#be123c' },
    ],
  },
  // Faroese is the one set I am least sure of — worth a native check before
  // anyone relies on it. No local app on purpose: MobilePay is not available in
  // the Faroe Islands, so the set stays generic.
  fo: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Debetkort', icon: '/brands/debit.svg' },
      { name: 'Bankgreiðsla', icon: null },
    ],
    categories: [
      { name: 'Underhaldning', color: '#7c3aed' },
      { name: 'Húsarhaldskostnaður', color: '#0369a1' },
      { name: 'Tólbúnaður', color: '#0f766e' },
      { name: 'Bústaður', color: '#b45309' },
      { name: 'Áskriftir', color: '#be123c' },
    ],
  },
  uk: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Дебетова картка', icon: '/brands/debit.svg' },
      { name: 'Банківський переказ', icon: null },
    ],
    categories: [
      { name: 'Розваги', color: '#7c3aed' },
      { name: 'Комунальні послуги', color: '#0369a1' },
      { name: 'Програми', color: '#0f766e' },
      { name: 'Житло', color: '#b45309' },
      { name: 'Підписки', color: '#be123c' },
    ],
  },
  es: {
    paymentMethods: [
      VISA,
      MASTERCARD,
      { name: 'Tarjeta de débito', icon: '/brands/debit.svg' },
      { name: 'Bizum', icon: '/brands/wallet.svg' },
      { name: 'Transferencia bancaria', icon: null },
    ],
    categories: [
      { name: 'Entretenimiento', color: '#7c3aed' },
      { name: 'Suministros', color: '#0369a1' },
      { name: 'Software', color: '#0f766e' },
      { name: 'Vivienda', color: '#b45309' },
      { name: 'Suscripciones', color: '#be123c' },
    ],
  },
}

export const SEED_LOCALES = Object.keys(SEED_SETS)

/** Endonyms, so a picker reads naturally to the person choosing. */
export const SEED_LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  zh: '中文',
  da: 'Dansk',
  fr: 'Français',
  sv: 'Svenska',
  nb: 'Norsk bokmål',
  fo: 'Føroyskt',
  uk: 'Українська',
  es: 'Español',
}

/** Matches on the language subtag, so `de-AT` and `en-GB` find their sets. */
export function defaultSeedSet(locale: string): SeedSet {
  const language = locale.split('-')[0]?.toLowerCase() ?? ''
  return SEED_SETS[language] ?? SEED_SETS.en
}
