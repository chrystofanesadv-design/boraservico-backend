import { Injectable, BadRequestException } from '@nestjs/common';

type AvailabilitySlot = {
  id: string;
  professionalId: string;
  weekday: number;
  weekdayLabel: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'segunda-feira',
  2: 'terça-feira',
  3: 'quarta-feira',
  4: 'quinta-feira',
  5: 'sexta-feira',
  6: 'sábado',
  7: 'domingo',
};

@Injectable()
export class AvailabilityService {
  private readonly slots = new Map<string, AvailabilitySlot[]>();

  listForProfessional(professionalId: string) {
    return {
      success: true,
      professionalId,
      slots: this.slots.get(professionalId) ?? [],
      message:
        'Agenda carregada. O profissional pode definir dias e horários para receber pedidos mais compatíveis.',
    };
  }

  saveForProfessional(professionalId: string, body: any) {
    const slotsInput = Array.isArray(body?.slots) ? body.slots : [];

    const normalized = slotsInput.map((slot: any, index: number) =>
      this.normalizeSlot(professionalId, slot, index),
    );

    this.slots.set(professionalId, normalized);

    return {
      success: true,
      professionalId,
      slots: normalized,
      message:
        'Agenda atualizada. O BoraServiço vai priorizar pedidos compatíveis com sua disponibilidade.',
    };
  }

  suggestForRequest(body: any) {
    const preferredWeekday = Number(body?.preferredWeekday ?? 0);
    const preferredDate = this.readString(body?.preferredDate);
    const urgency = this.readString(body?.urgency).toLowerCase();

    return {
      success: true,
      preferredDate,
      preferredWeekday,
      priorityMode: urgency.includes('urgente') || urgency.includes('agora'),
      strategy:
        'Priorizar profissionais ativos, próximos e disponíveis no dia/horário desejado, sem aumentar o preço por urgência.',
      maxProfessionals: 3,
      message:
        'Sugestão criada. A busca deve priorizar até 3 profissionais compatíveis com a agenda do cliente.',
    };
  }

  private normalizeSlot(
    professionalId: string,
    slot: any,
    index: number,
  ): AvailabilitySlot {
    const weekday = Number(slot?.weekday);

    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw new BadRequestException(
        'weekday deve ser um número de 1 a 7. Exemplo: 1 segunda-feira, 2 terça-feira.',
      );
    }

    const startTime = this.normalizeTime(slot?.startTime, 'startTime');
    const endTime = this.normalizeTime(slot?.endTime, 'endTime');

    if (startTime >= endTime) {
      throw new BadRequestException(
        'O horário inicial deve ser menor que o horário final.',
      );
    }

    const now = new Date().toISOString();

    return {
      id: this.readString(slot?.id) || `${professionalId}-${weekday}-${index}`,
      professionalId,
      weekday,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      startTime,
      endTime,
      isActive: slot?.isActive !== false,
      createdAt: this.readString(slot?.createdAt) || now,
      updatedAt: now,
    };
  }

  private normalizeTime(value: any, field: string) {
    const text = this.readString(value);

    if (!/^\d{2}:\d{2}$/.test(text)) {
      throw new BadRequestException(`${field} deve estar no formato HH:mm.`);
    }

    return text;
  }

  private readString(value: any) {
    return typeof value === 'string' ? value.trim() : '';
  }
}
