import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One header for public content pages; the home page keeps its dedicated hero. */
@Component({
  selector: 'app-public-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="public-page-header">
      <div class="public-page-header-copy">
        @if(eyebrow()) {
          <p class="public-eyebrow">{{ eyebrow() }}</p>
        }
        <h1 class="public-title">{{ heading() }}</h1>
        @if(description()) {
          <p class="public-intro">{{ description() }}</p>
        }
      </div>
      <!-- Keep actions in the owning page so refresh/loading behaviour is unchanged. -->
      <div class="public-page-header-actions"><ng-content select="[header-actions]" /></div>
    </header>
  `,
  styles: `
    :host { display: block; }
    /* Typography reuses public-title/eyebrow/intro from the existing Performance page. */
    .public-page-header {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      border-bottom: 1px solid rgb(255 255 255 / 10%);
      padding-bottom: 1.5rem;
    }
    .public-page-header-copy { min-width: 0; }
    .public-page-header-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; flex-shrink: 0; }
    /* Pages without actions or descriptions must not reserve empty rows. */
    .public-page-header-actions:empty { display: none; }
    @media (min-width: 64rem) {
      .public-page-header { flex-direction: row; align-items: flex-end; justify-content: space-between; }
    }
  `,
})
export class PublicPageHeaderComponent {
  readonly heading = input.required<string>();
  readonly eyebrow = input('RYVL Esports');
  readonly description = input<string | null>(null);
}
