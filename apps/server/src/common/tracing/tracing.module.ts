/**
 * Tracing Module
 * 
 * This module re-exports utilities from nestjs-otel for convenient use
 * across the application. Import this module in feature modules that
 * need custom tracing capabilities.
 * 
 * Usage:
 * 
 * 1. Import in your feature module:
 *    @Module({
 *      imports: [TracingModule],
 *      ...
 *    })
 * 
 * 2. Use decorators in your service:
 *    @Traceable()  // Automatically trace all methods
 *    export class MyService {
 *      @Span('custom-operation-name')  // Custom span name
 *      async myMethod() { ... }
 *    }
 * 
 * 3. Or inject TraceService for programmatic access:
 *    constructor(private readonly traceService: TraceService) {}
 */
import { Module } from '@nestjs/common';
import { TraceService, MetricService } from 'nestjs-otel';

// Re-export commonly used decorators and services
export { Span, Traceable } from 'nestjs-otel';
export { TraceService, MetricService } from 'nestjs-otel';

@Module({
  providers: [TraceService, MetricService],
  exports: [TraceService, MetricService],
})
export class TracingModule {}
