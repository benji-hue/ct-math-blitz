/**
 * Глобальные настройки приложения. Всё, что зависит от окружения, читается из
 * переменных Vite (VITE_*), поэтому одна и та же сборка может жить на Cloudflare
 * (вместе с API на одном домене) или на GitHub Pages (API — на воркере).
 */

export const APP_NAME = 'Крок'
export const APP_TAGLINE = 'Шаг за шагом — к 100 баллам'
export const APP_VERSION = '2.0.0'

/**
 * Адрес API воркера. Пустая строка — тот же домен (когда мини-апп раздаёт сам
 * воркер). Для сборки на GitHub Pages задайте VITE_API_BASE=https://<worker>.workers.dev
 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '') ?? ''

/** Бот «Крока» (без @) — для кнопки «Пригласить друга». Переопределяется VITE_BOT_USERNAME. */
export const BOT_USERNAME = ((import.meta.env.VITE_BOT_USERNAME as string | undefined) || 'PFPFISJFOIJBOT').replace(/^@/, '')

export const STORAGE_KEY = 'krok:state:v1'
