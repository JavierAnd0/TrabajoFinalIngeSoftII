export interface NotificationEventItem {
  id: string;
  eventType: string;
  studentId: string;
  title: string;
  message: string;
  processedAt: string;
  latencyMs: number;
}

export class NotificationLogAdapter {
  private readonly logs: NotificationEventItem[] = [];
  private completedCount = 4;
  private failedCount = 0;

  public async processNotification(payload: {
    eventType?: string;
    studentId?: string;
    title?: string;
    message?: string;
  }): Promise<NotificationEventItem> {
    const start = Date.now();
    const entry: NotificationEventItem = {
      id: `notif-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      eventType: payload.eventType || 'ACADEMIC_NOTIFICATION',
      studentId: payload.studentId || '44444444-4444-4444-8444-444444444403',
      title: payload.title || 'Notificación Académica USCO',
      message: payload.message || 'Evento procesado por Async Worker Service.',
      processedAt: new Date().toISOString(),
      latencyMs: Math.max(8, Date.now() - start),
    };

    this.logs.unshift(entry);
    if (this.logs.length > 50) {
      this.logs.pop();
    }
    this.completedCount += 1;

    return entry;
  }

  public getStats() {
    const avgLatency =
      this.logs.length > 0
        ? Math.round(
            this.logs.reduce((acc, item) => acc + item.latencyMs, 0) /
              this.logs.length
          )
        : 24;

    return {
      waiting: 0,
      active: 0,
      completed: this.completedCount,
      failed: this.failedCount,
      avgProcessingTimeMs: avgLatency,
      recentNotifications: this.logs.slice(0, 10),
    };
  }
}
