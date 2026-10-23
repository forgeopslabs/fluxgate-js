import { Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';
import { FluxGateService } from './fluxgate.service';

/**
 * Renders its template only while a boolean flag is on, and the `else`
 * template otherwise.
 *
 * ```html
 * <express-checkout *fgFlag="'new-checkout'; else classic" />
 * <ng-template #classic><classic-checkout /></ng-template>
 * ```
 */
@Directive({ selector: '[fgFlag]' })
export class FluxGateFlagDirective {
  /** The boolean flag key. */
  readonly fgFlag = input.required<string>();
  /** Template to show while the flag is off. */
  readonly fgFlagElse = input<TemplateRef<unknown> | null>(null);

  private readonly service = inject(FluxGateService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private shown: TemplateRef<unknown> | null | undefined;

  constructor() {
    effect(() => {
      const next = this.service.value(this.fgFlag(), false) ? this.template : this.fgFlagElse();
      if (next !== this.shown) {
        this.container.clear();
        if (next) {
          this.container.createEmbeddedView(next);
        }
        this.shown = next;
      }
    });
  }
}
