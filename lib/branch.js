'use client'
import { createContext, useContext } from 'react'
// Contexto del sistema interno: usuario, sedes permitidas, sede actual, caja abierta y configuración
export const AppCtx = createContext({ branchId: null, branches: [], settings: {} })
export const useApp = () => useContext(AppCtx)
// scope = id de la sede actual, o null si está en "Todas las sedes"
export const useScope = () => { const a = useApp(); return a.branchId && a.branchId !== 'all' ? a.branchId : null }
