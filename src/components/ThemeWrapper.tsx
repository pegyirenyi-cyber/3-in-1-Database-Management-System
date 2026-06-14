import { ReactNode } from 'react';
import { ThemeType } from '../types';

export interface ThemeStyles {
  name: ThemeType;
  primaryBg: string;
  primaryHover: string;
  accentText: string;
  lightBg: string;
  badgeBg: string;
  badgeText: string;
  cardBorder: string;
  shadowColor: string;
  accentBorder: string;
  btnColors: string;
  secondaryBtnColors: string;
  gradientHeader: string;
  heroBg: string;
}

export const THEME_CONFIGS: Record<ThemeType, ThemeStyles> = {
  Classic: {
    name: 'Classic',
    primaryBg: 'bg-blue-600',
    primaryHover: 'hover:bg-blue-700',
    accentText: 'text-blue-600',
    lightBg: 'bg-blue-50/70',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    cardBorder: 'border-blue-100',
    shadowColor: 'shadow-blue-50',
    accentBorder: 'border-blue-500',
    btnColors: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondaryBtnColors: 'bg-slate-100 hover:bg-slate-200 text-slate-800',
    gradientHeader: 'from-blue-700 to-indigo-800',
    heroBg: 'bg-gradient-to-r from-blue-50 to-indigo-50'
  },
  Emerald: {
    name: 'Emerald',
    primaryBg: 'bg-emerald-600',
    primaryHover: 'hover:bg-emerald-700',
    accentText: 'text-emerald-600',
    lightBg: 'bg-emerald-50/70',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    cardBorder: 'border-emerald-100',
    shadowColor: 'shadow-emerald-50',
    accentBorder: 'border-emerald-500',
    btnColors: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    secondaryBtnColors: 'bg-slate-100 hover:bg-slate-200 text-slate-800',
    gradientHeader: 'from-emerald-700 to-teal-800',
    heroBg: 'bg-gradient-to-r from-emerald-50 to-teal-50'
  },
  Ruby: {
    name: 'Ruby',
    primaryBg: 'bg-rose-600',
    primaryHover: 'hover:bg-rose-700',
    accentText: 'text-rose-600',
    lightBg: 'bg-rose-50/70',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800',
    cardBorder: 'border-rose-100',
    shadowColor: 'shadow-rose-50',
    accentBorder: 'border-rose-500',
    btnColors: 'bg-rose-600 hover:bg-rose-700 text-white',
    secondaryBtnColors: 'bg-slate-100 hover:bg-slate-200 text-slate-800',
    gradientHeader: 'from-rose-700 to-red-800',
    heroBg: 'bg-gradient-to-r from-rose-50 to-red-50'
  },
  Cosmic: {
    name: 'Cosmic',
    primaryBg: 'bg-purple-600',
    primaryHover: 'hover:bg-purple-700',
    accentText: 'text-purple-600',
    lightBg: 'bg-purple-50/60',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800',
    cardBorder: 'border-purple-100',
    shadowColor: 'shadow-purple-50',
    accentBorder: 'border-purple-500',
    btnColors: 'bg-purple-600 hover:bg-purple-700 text-white',
    secondaryBtnColors: 'bg-slate-100 hover:bg-slate-200 text-slate-800',
    gradientHeader: 'from-purple-800 to-violet-950',
    heroBg: 'bg-gradient-to-r from-purple-50 to-violet-50'
  },
  Gold: {
    name: 'Gold',
    primaryBg: 'bg-amber-600',
    primaryHover: 'hover:bg-amber-700',
    accentText: 'text-amber-600',
    lightBg: 'bg-amber-50/60',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    cardBorder: 'border-amber-100',
    shadowColor: 'shadow-amber-50',
    accentBorder: 'border-amber-500',
    btnColors: 'bg-amber-600 hover:bg-amber-700 text-white',
    secondaryBtnColors: 'bg-slate-100 hover:bg-slate-200 text-slate-800',
    gradientHeader: 'from-amber-700 to-slate-900',
    heroBg: 'bg-gradient-to-r from-amber-50 to-slate-50'
  },
  'Sophisticated Dark': {
    name: 'Sophisticated Dark',
    primaryBg: 'bg-indigo-600',
    primaryHover: 'hover:bg-[#4f46e5]',
    accentText: 'text-indigo-400',
    lightBg: 'bg-[#0f172a]/80',
    badgeBg: 'bg-slate-800',
    badgeText: 'text-slate-300',
    cardBorder: 'border-slate-800',
    shadowColor: 'shadow-slate-950/50',
    accentBorder: 'border-indigo-500/30',
    btnColors: 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/20',
    secondaryBtnColors: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700',
    gradientHeader: 'from-[#0f172a] to-[#1e293b]',
    heroBg: 'bg-[#020617]'
  },
  'Crystal Glass': {
    name: 'Crystal Glass',
    primaryBg: 'bg-sky-600/90',
    primaryHover: 'hover:bg-sky-700/90',
    accentText: 'text-sky-600',
    lightBg: 'bg-white/40 backdrop-blur-md border border-white/40 shadow-xs',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-800',
    cardBorder: 'border-white/50 backdrop-blur-md',
    shadowColor: 'shadow-sky-950/5',
    accentBorder: 'border-sky-500/40',
    btnColors: 'bg-sky-600/80 hover:bg-sky-700/90 backdrop-blur-xs text-white border border-sky-500/30 font-bold',
    secondaryBtnColors: 'bg-white/50 hover:bg-white/75 text-slate-800 border border-white/60 backdrop-blur-xs font-semibold',
    gradientHeader: 'from-slate-900/95 via-indigo-950/90 to-sky-950/90 backdrop-blur-md border-b border-white/10',
    heroBg: 'bg-gradient-to-tr from-slate-100 via-sky-50 to-indigo-50'
  }
};
