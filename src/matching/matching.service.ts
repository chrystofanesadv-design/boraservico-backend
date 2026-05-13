import { Injectable } from '@nestjs/common';

interface ProfessionalMock {
  id: string;
  name: string;
  category: string;
  rating: number;
  distanceKm: number;
  online: boolean;
  priority: number;
}

interface DispatchMock {
  id: string;
  orderId: string;
  category: string;
  status: 'DISPATCHED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  radiusKm: number;
  professionals: ProfessionalMock[];
  selectedProfessionalId?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MatchingService {
  private professionals: ProfessionalMock[] = [
    {
      id: 'profissional-1',
      name: 'Carlos Eletricista',
      category: 'eletrica',
      rating: 4.9,
      distanceKm: 1.2,
      online: true,
      priority: 100,
    },
    {
      id: 'profissional-2',
      name: 'Joao Reparos',
      category: 'eletrica',
      rating: 4.7,
      distanceKm: 2.4,
      online: true,
      priority: 90,
    },
    {
      id: 'profissional-3',
      name: 'Ana Limpeza',
      category: 'limpeza',
      rating: 4.8,
      distanceKm: 1.8,
      online: true,
      priority: 95,
    },
  ];

  private dispatches: DispatchMock[] = [];

  private normalizeCategory(category?: string): string {
    return (category ?? 'eletrica')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  listProfessionals(): ProfessionalMock[] {
    return this.professionals;
  }

  listDispatches(): DispatchMock[] {
    return this.dispatches;
  }

  dispatch(data: any): DispatchMock {
    const category = this.normalizeCategory(data?.category);
    const radiusKm = Number(data?.radiusKm ?? 5);

    const matchedProfessionals = this.professionals
      .filter((professional) => professional.online)
      .filter((professional) => professional.distanceKm <= radiusKm)
      .filter((professional) => professional.category === category)
      .sort((a, b) => b.priority - a.priority || b.rating - a.rating);

    const dispatch: DispatchMock = {
      id: crypto.randomUUID(),
      orderId: data?.orderId ?? crypto.randomUUID(),
      category,
      radiusKm,
      status: 'DISPATCHED',
      professionals: matchedProfessionals,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.dispatches.push(dispatch);

    return dispatch;
  }

  accept(data: any): DispatchMock | { error: string; message: string } {
    const dispatch = this.dispatches.find((item) => item.id === data?.dispatchId);

    if (!dispatch) {
      return {
        error: 'DISPATCH_NOT_FOUND',
        message: 'Disparo nao encontrado',
      };
    }

    dispatch.status = 'ACCEPTED';
    dispatch.selectedProfessionalId = data?.professionalId;
    dispatch.updatedAt = new Date();

    return dispatch;
  }

  reject(data: any): DispatchMock | { error: string; message: string } {
    const dispatch = this.dispatches.find((item) => item.id === data?.dispatchId);

    if (!dispatch) {
      return {
        error: 'DISPATCH_NOT_FOUND',
        message: 'Disparo nao encontrado',
      };
    }

    dispatch.status = 'REJECTED';
    dispatch.updatedAt = new Date();

    return dispatch;
  }
}