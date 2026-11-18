'use client'
import { Modal } from './ui'
import { printTicket, ticketPDF, ticketBodyHTML, TICKET_CSS } from './tickets'
// Vista previa del ticket con botones de imprimir y descargar PDF
export const TicketModal = ({ sale, ctx, onClose, children }) => <Modal title={`${sale.voucher} ${sale.number || sale.order_number || ''}`} onClose={onClose}>
  <style>{TICKET_CSS}</style><div className="tkbox" dangerouslySetInnerHTML={{ __html: ticketBodyHTML(sale, ctx) }} />
  <div className="row" style={{ gap: 8 }}><button className="btn" style={{ flex: 1 }} onClick={() => printTicket(sale, ctx)}>🖨 Imprimir ticket</button><button className="btn o" style={{ flex: 1 }} onClick={() => ticketPDF(sale, ctx)}>⬇ Descargar PDF</button></div>{children}</Modal>
