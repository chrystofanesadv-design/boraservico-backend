type TeamMember = {
  id: string;
  name: string;
  role: string;
  responsibility: string;
  status: 'invited' | 'accepted' | 'active' | 'paused';
  sharePercent: number;
  ratingPreview: number;
};

type TeamTask = {
  id: string;
  title: string;
  assignedTo: string;
  status: 'pending' | 'in_progress' | 'done';
  checklist: string[];
};

type ProfessionalTeam = {
  id: string;
  name: string;
  leaderId: string;
  leaderName: string;
  category: string;
  description: string;
  idealFor: string[];
  members: TeamMember[];
  tasks: TeamTask[];
  budgetSplit: Record<string, number>;
  timeline: string[];
  aiSummary: string;
  createdAt: string;
  updatedAt: string;
};

export class ProfessionalTeamsService {
  private readonly teams = new Map<string, ProfessionalTeam>();

  constructor() {
    const initialTeam: ProfessionalTeam = {
      id: 'team-demo-premium',
      name: 'Equipe Premium de Reforma Completa',
      leaderId: 'professional-demo',
      leaderName: 'Profissional lider',
      category: 'Reforma e manutencao',
      description: 'Equipe preparada para servicos grandes com lider, divisao de tarefas e acompanhamento por etapas.',
      idealFor: ['Reformas maiores', 'Servicos com eletrica e pintura', 'Demandas com mais de um profissional'],
      members: [
        {
          id: 'member-1',
          name: 'Lider da equipe',
          role: 'Lider tecnico',
          responsibility: 'Organizar escopo, prazo, equipe e comunicacao com o cliente.',
          status: 'active',
          sharePercent: 50,
          ratingPreview: 4.9,
        },
        {
          id: 'member-2',
          name: 'Apoio operacional',
          role: 'Execucao',
          responsibility: 'Executar tarefas principais e registrar andamento.',
          status: 'accepted',
          sharePercent: 30,
          ratingPreview: 4.8,
        },
        {
          id: 'member-3',
          name: 'Especialista convidado',
          role: 'Especialista',
          responsibility: 'Entrar quando o servico exigir conhecimento especifico.',
          status: 'invited',
          sharePercent: 20,
          ratingPreview: 4.7,
        },
      ],
      tasks: [
        {
          id: 'task-1',
          title: 'Diagnostico e organizacao do escopo',
          assignedTo: 'member-1',
          status: 'done',
          checklist: ['Conferir fotos', 'Validar endereco apos pagamento', 'Explicar etapas ao cliente'],
        },
        {
          id: 'task-2',
          title: 'Execucao principal',
          assignedTo: 'member-2',
          status: 'in_progress',
          checklist: ['Separar materiais', 'Registrar prova visual', 'Atualizar timeline'],
        },
        {
          id: 'task-3',
          title: 'Revisao final e evidencias',
          assignedTo: 'member-1',
          status: 'pending',
          checklist: ['Foto final', 'Checklist de conclusao', 'Solicitar avaliacao multidimensional'],
        },
      ],
      budgetSplit: {
        'member-1': 50,
        'member-2': 30,
        'member-3': 20,
      },
      timeline: [
        'Equipe criada pelo lider.',
        'Membros convidados.',
        'Tarefas principais distribuidas.',
        'Divisao de orÃ§amento preparada para aceite final.',
      ],
      aiSummary:
        'A equipe permite atender servicos maiores sem confundir o cliente: um lider responde pela organizacao, cada membro possui tarefa clara e o orÃ§amento pode ser dividido de forma transparente.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.teams.set(initialTeam.id, initialTeam);
  }

  list() {
    return Array.from(this.teams.values());
  }

  findOne(teamId: string) {
    const team = this.teams.get(teamId);
    if (team) return team;
    return {
      id: teamId,
      notFound: true,
      message: 'Equipe nao encontrada no ambiente atual.',
    };
  }

  create(body: Record<string, unknown>) {
    const now = new Date().toISOString();
    const id = `team-${Date.now()}`;
    const team: ProfessionalTeam = {
      id,
      name: String(body.name || 'Nova equipe profissional'),
      leaderId: String(body.leaderId || 'professional-current'),
      leaderName: String(body.leaderName || 'Lider da equipe'),
      category: String(body.category || 'Servicos gerais'),
      description: String(body.description || 'Equipe criada para servicos que exigem mais de um profissional.'),
      idealFor: Array.isArray(body.idealFor) ? (body.idealFor as string[]) : ['Servico grande', 'Demanda com varias etapas'],
      members: [],
      tasks: [],
      budgetSplit: {},
      timeline: ['Equipe criada.'],
      aiSummary: 'Equipe criada com estrutura pronta para membros, tarefas, timeline e divisao de orÃ§amento.',
      createdAt: now,
      updatedAt: now,
    };
    this.teams.set(id, team);
    return team;
  }

  addMember(teamId: string, body: Record<string, unknown>) {
    const team = this.ensureTeam(teamId);
    const member: TeamMember = {
      id: String(body.id || `member-${Date.now()}`),
      name: String(body.name || 'Novo membro'),
      role: String(body.role || 'Apoio'),
      responsibility: String(body.responsibility || 'Apoiar execucao do servico.'),
      status: 'invited',
      sharePercent: Number(body.sharePercent || 0),
      ratingPreview: Number(body.ratingPreview || 5),
    };
    team.members.push(member);
    team.timeline.push(`Membro convidado: ${member.name}`);
    team.updatedAt = new Date().toISOString();
    return team;
  }

  addTask(teamId: string, body: Record<string, unknown>) {
    const team = this.ensureTeam(teamId);
    const task: TeamTask = {
      id: String(body.id || `task-${Date.now()}`),
      title: String(body.title || 'Nova tarefa'),
      assignedTo: String(body.assignedTo || 'member-1'),
      status: 'pending',
      checklist: Array.isArray(body.checklist) ? (body.checklist as string[]) : ['Confirmar tarefa', 'Executar', 'Registrar conclusao'],
    };
    team.tasks.push(task);
    team.timeline.push(`Tarefa criada: ${task.title}`);
    team.updatedAt = new Date().toISOString();
    return team;
  }

  updateTaskStatus(teamId: string, taskId: string, body: Record<string, unknown>) {
    const team = this.ensureTeam(teamId);
    const task = team.tasks.find((item) => item.id === taskId);
    if (!task) return { teamId, taskId, updated: false, message: 'Tarefa nao encontrada.' };
    const status = String(body.status || task.status) as TeamTask['status'];
    task.status = status;
    team.timeline.push(`Status da tarefa ${task.title}: ${status}`);
    team.updatedAt = new Date().toISOString();
    return team;
  }

  updateBudgetSplit(teamId: string, body: Record<string, unknown>) {
    const team = this.ensureTeam(teamId);
    const split = body.split;
    if (split && typeof split === 'object' && !Array.isArray(split)) {
      team.budgetSplit = split as Record<string, number>;
    }
    team.timeline.push('Divisao de orÃ§amento atualizada pelo lider.');
    team.updatedAt = new Date().toISOString();
    return team;
  }

  private ensureTeam(teamId: string): ProfessionalTeam {
    const existing = this.teams.get(teamId);
    if (existing) return existing;
    const created = this.create({ name: `Equipe ${teamId}` });
    return created;
  }
}