import { Controller, Get } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Controller('__routes')
export class RoutesDebugController {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  @Get()
  listRoutes() {
    const adapter: any = this.httpAdapterHost.httpAdapter;
    const instance: any = adapter?.getInstance?.();

    const routes: string[] = [];

    const expressStack = instance?._router?.stack ?? instance?.router?.stack ?? [];
    for (const layer of expressStack) {
      if (layer?.route?.path) {
        const methods = Object.keys(layer.route.methods ?? {})
          .filter((method) => layer.route.methods[method])
          .map((method) => method.toUpperCase())
          .join(',');

        routes.push(`${methods} ${layer.route.path}`);
      }
    }

    return {
      status: 'ok',
      adapter: adapter?.constructor?.name ?? 'unknown',
      total: routes.length,
      routes: routes.sort(),
      checkedAt: new Date().toISOString(),
    };
  }
}
