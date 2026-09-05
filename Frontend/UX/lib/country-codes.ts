export type CountryCode = {
  iso: string
  name: string
  dial: string
}

export const countryCodes: CountryCode[] = [
  { iso: 'US', name: 'United States', dial: '+1' },
  { iso: 'CA', name: 'Canada', dial: '+1' },
  { iso: 'GB', name: 'United Kingdom', dial: '+44' },
  { iso: 'IN', name: 'India', dial: '+91' },
  { iso: 'AU', name: 'Australia', dial: '+61' },
  { iso: 'DE', name: 'Germany', dial: '+49' },
  { iso: 'FR', name: 'France', dial: '+33' },
  { iso: 'ES', name: 'Spain', dial: '+34' },
  { iso: 'IT', name: 'Italy', dial: '+39' },
  { iso: 'NL', name: 'Netherlands', dial: '+31' },
  { iso: 'BR', name: 'Brazil', dial: '+55' },
  { iso: 'MX', name: 'Mexico', dial: '+52' },
  { iso: 'JP', name: 'Japan', dial: '+81' },
  { iso: 'KR', name: 'South Korea', dial: '+82' },
  { iso: 'CN', name: 'China', dial: '+86' },
  { iso: 'SG', name: 'Singapore', dial: '+65' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '+971' },
  { iso: 'ZA', name: 'South Africa', dial: '+27' },
  { iso: 'NG', name: 'Nigeria', dial: '+234' },
  { iso: 'KE', name: 'Kenya', dial: '+254' },
  { iso: 'NZ', name: 'New Zealand', dial: '+64' },
  { iso: 'IE', name: 'Ireland', dial: '+353' },
  { iso: 'SE', name: 'Sweden', dial: '+46' },
  { iso: 'PH', name: 'Philippines', dial: '+63' },
  { iso: 'PK', name: 'Pakistan', dial: '+92' },
  { iso: 'BD', name: 'Bangladesh', dial: '+880' },
]

export function maskPhone(dial: string, number: string) {
  const digits = number.replace(/\D/g, '')
  if (digits.length < 4) return `${dial} ${digits || '••• ••• ••••'}`
  return `${dial} ••• ••• ${digits.slice(-4)}`
}
