/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  LitElement,
  html,
  svg,
  TemplateResult,
  SVGTemplateResult,
  PropertyValues,
  CSSResultGroup,
} from 'lit';
import { styleMap } from 'lit/directives/style-map';
import { customElement, property, state } from "lit/decorators";
import {
  HomeAssistant,
  // hasAction,
  ActionHandlerEvent,
  // LovelaceCardEditor,
  getLovelace,
  stateIcon,
} from 'custom-card-helpers'; // This is a community maintained npm module with common helper functions/types. https://github.com/custom-cards/custom-card-helpers


// import './editor';

import type { Config, SankeyChartConfig, SectionState, EntityConfigOrStr, Box } from './types';
// import { actionHandler } from './action-handler-directive';
import { UNIT_PREFIXES } from './const';
import {version} from '../package.json';
import { localize } from './localize/localize';
import styles from './styles';

/* eslint no-console: 0 */
console.info(
  `%c sankey-chart %c ${localize('common.version')} ${version} `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// This puts your card into the UI card picker dialog
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'sankey-chart',
  name: 'Sankey Chart',
  description: 'A card to display a sankey chart. For example for power consumptionA template custom card for you to create something awesome',
});

@customElement('sankey-chart')
export class SankeyChart extends LitElement {
  // public static async getConfigElement(): Promise<LovelaceCardEditor> {
  //   return document.createElement('sankey-chart-editor');
  // }

  public static getStubConfig(): Record<string, unknown> {
    return {};
  }

  // https://lit.dev/docs/components/properties/
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) private entities: string[] = [];
  
  @state() private config!: Config;
  @state() public height = 200;
  @state() private sections: SectionState[] = [];
  @state() private statePerPixelY = 0;

  // https://lit.dev/docs/components/properties/#accessors-custom
  public setConfig(config: SankeyChartConfig): void {
    if (!config || !Array.isArray(config.sections)) {
      throw new Error(localize('common.invalid_configuration'));
    }

    if (config.test_gui) {
      getLovelace().setEditMode(true);
    }

    this.config = {
      height: 200,
      unit_prefix: '',
      round: 0,
      min_box_height: 3,
      min_box_distance: 5,
      ...config,
    };

    this.height = this.config.height;

    const entities: string[] = [];
    config.sections.forEach(section => {
      section.entities.forEach(ent => {
        entities.push(this._getEntityId(ent));
      });
    });
    this.entities = entities;
  }

  public getCardSize(): number {
    return 4;
  }

  // https://lit.dev/docs/components/lifecycle/#reactive-update-cycle-performing
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) {
      return false;
    }
    if (changedProps.has('config')) {
      return true;
    }
    return this.entities.some(entity => {
      const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
      if (oldHass) {
        return oldHass.states[entity] !== this.hass.states[entity];
      }
      return true;
    });
  }

  // https://lit.dev/docs/components/rendering/
  protected render(): TemplateResult | void {
    // if (this.config.show_warning) {
    //   return this._showWarning(localize('common.show_warning'));
    // }
    const errEntityId = this.entities.find(ent => !this._getEntityState(ent));
    if (errEntityId) {
      return this._showError(localize('common.entity_not_found'));
    }

    this._calcElements();

        // @action=${this._handleAction}
        // .actionHandler=${actionHandler({
        //   hasHold: hasAction(this.config.hold_action),
        //   hasDoubleClick: hasAction(this.config.double_tap_action),
        // })}
    return html`
      <ha-card
        tabindex="0"
        label="Sankey Chart"
      >
      <div class="container ${this.config.wide ? 'wide' : ''}" style=${styleMap({height: this.height+'px'})}>
        ${this.sections.map((s, i) => this.renderSection(i))}
      </div>
      </ha-card>
    `;
  }

  protected renderSection(index: number): TemplateResult {
    const {show_names, show_icons} = this.config;
    const section = this.sections[index];
    const {boxes} = section;
    const hasChildren = index < this.sections.length - 1 && boxes.some(b => b.children.length > 0);
    
    return html`
        <div class="section">
          ${hasChildren ?
            html`<div class="connectors">
              <svg viewBox="0 0 100 ${this.height}" preserveAspectRatio="none">
                ${this.renderBranchConnectors(index)}
              </svg>
            </div>` :
            null
          }
          ${boxes.map((box, i) => {
            return html`
              ${i > 0 ? html`<div class="spacerv" style=${styleMap({height: section.spacerH+'px'})}></div>` : null}
              <div class="box" style=${styleMap({height: box.size+'px'})}>
                <div style=${styleMap({backgroundColor: box.color})}>
                  ${show_icons && html`<ha-icon .icon=${stateIcon(box.entity)}></ha-icon>`}
                </div>
                <div class="label">${box.state.toFixed(this.config.round)}${box.unit_of_measurement}
                  ${show_names && html`<span>${box.config.name || box.entity.attributes.friendly_name}</span>`}
                </div>
              </div>
            `;
          })}
        </div>
    `;
  }

  protected renderBranchConnectors(index: number): SVGTemplateResult[] {
    const section = this.sections[index];
    const {boxes} = section;
    return boxes.filter(b => b.children.length > 0).map(b => {
      const children = this.sections[index + 1].boxes.filter(child => b.children.includes(child.entity_id));
      let startYOffset = 0;
      const connections = children.map(c => {
        const endYOffset = c.connections.parents.reduce((sum, c) => sum + c.endSize, 0);
        const startY = b.top + startYOffset;
        // c.state could be less because of previous connections
        const remainingEndState = Math.ceil(c.state - (endYOffset / c.size * c.state));
        const startSize = Math.max(Math.min(remainingEndState / b.state * b.size, b.size - startYOffset), 1);
        const endY = c.top + endYOffset;
        const endSize = Math.min(c.size - endYOffset, b.size - startYOffset);
        if (endSize > 0) {
          // only increment if this connection will be rendered
          startYOffset += startSize;
        }

        const connection = {
          startY, 
          startSize, 
          startColor: b.color,
          endY, 
          endSize,
          endColor: c.color,
        };
        c.connections.parents.push(connection);
        return connection;
      }).filter(c => c.endSize > 0);
      return svg`
        <defs>
          ${connections.map((c, i) => svg`
            <linearGradient id="gradient${b.entity_id + i}">
              <stop offset="0%" stop-color="${c.startColor}"></stop>
              <stop offset="100%" stop-color="${c.endColor}"></stop>
            </linearGradient>
          `)}
        </defs>
        ${connections.map((c, i) => svg`
          <path d="M0,${c.startY} C50,${c.startY} 50,${c.endY} 100,${c.endY} L100,${c.endY+c.endSize} C50,${c.endY+c.endSize} 50,${c.startY+c.startSize} 0,${c.startY+c.startSize} Z"
            fill="url(#gradient${b.entity_id + i})" />
        `)}
      `;
    })
  }

  private _calcElements() {
    this.statePerPixelY = 0;
    this.sections = this.config.sections.map(section => {
      let total = 0;
      let boxes: Box[] = section.entities
        .filter(entity => {
          const state = Number(this._getEntityState(entity).state);
          return !isNaN(state) && state > 0;
        })
        .map(conf => {
          const entityConf = typeof conf === 'string' ? {entity_id: conf} : conf;
          const entity = this._getEntityState(entityConf);
          const {state, unit_of_measurement} = this._normalizeStateValue(
            Number(entity.state), 
            entity.attributes.unit_of_measurement
          );
          total += state;
          return {
            config: entityConf,
            entity,
            entity_id: this._getEntityId(entityConf),
            state,
            unit_of_measurement,
            color: entityConf.color || 'var(--primary-color)',
            children: entityConf.children ? entityConf.children : [],
            connections: {parents: []},
            top: 0,
            size: 0,
          };
        });
      if (!boxes.length) {
        return {
          boxes,
          total,
          spacerH: 0,
          statePerPixelY: 0,
        };
      }
      // leave room for margin
      const availableHeight = this.height - ((boxes.length - 1) * this.config.min_box_distance);
      // calc sizes to determine statePerPixelY ratio and find the best one 
      const calcResults = this._calcBoxHeights(boxes, availableHeight, total);
      boxes = calcResults.boxes;
      const totalSize = boxes.reduce((sum, b) => sum + b.size, 0);
      const extraSpace = this.height - totalSize;
      const spacerH = boxes.length > 1 ? extraSpace / (boxes.length - 1) : 0;
      let offset = 0;
      boxes = boxes.map(box => {
        const top = offset;
        offset += box.size + spacerH;
        return {
          ...box,
          top,
        };
      })
      return {
        boxes,
        total,
        spacerH,
        statePerPixelY: calcResults.statePerPixelY,
      };
    })
    .filter(s => s.boxes.length > 0)
    .map(section => {
      // calc sizes again with the best statePerPixelY
      let totalSize = 0;
      let {boxes} = section;
      if (section.statePerPixelY !== this.statePerPixelY) {
        boxes = boxes.map(box => {
          const size = Math.max(this.config.min_box_height, Math.floor(box.state/this.statePerPixelY));
          totalSize += size;
          return {
            ...box,
            size,
          };
        });
      } else {
        totalSize = boxes.reduce((sum, b) => sum + b.size, 0);
      }
      // calc vertical margin size
      const extraSpace = this.height - totalSize;
      const spacerH = boxes.length > 1 ? extraSpace / (boxes.length - 1) : 0;
      let offset = 0;
      // calc y positions. needed for connectors
      boxes = boxes.map(box => {
        const top = offset;
        offset += box.size + spacerH;
        return {
          ...box,
          top,
        };
      })
      return {
        ...section,
        boxes,
        spacerH,
      };
    });
  }

  private _calcBoxHeights(boxes: Box[], availableHeight: number, totalState: number)
    : {boxes: Box[], statePerPixelY: number} {
    const statePerPixelY = totalState / availableHeight;
    if (statePerPixelY > this.statePerPixelY) {
      this.statePerPixelY = statePerPixelY;
    }
    let deficitHeight = 0;
    const result = boxes.map(box => {
      if (box.size === this.config.min_box_height) {
        return box;
      }
      let size = Math.floor(box.state/this.statePerPixelY);
      if (size < this.config.min_box_height) {
        deficitHeight += this.config.min_box_height - size;
        size = this.config.min_box_height;
      }
      return {
        ...box,
        size,
      };
    });
    if (deficitHeight > 0) {
      return this._calcBoxHeights(result, availableHeight - deficitHeight, totalState);
    }
    return {boxes: result, statePerPixelY: this.statePerPixelY};
  }

  private _normalizeStateValue(state: number, unit_of_measurement?: string) {
    if (!unit_of_measurement) {
      return {state, unit_of_measurement};
    }
    const {unit_prefix} = this.config;
    const prefix = Object.keys(UNIT_PREFIXES).find(p => unit_of_measurement!.indexOf(p) === 0) || '';
    const currentFactor = UNIT_PREFIXES[prefix] || 1;
    const targetFactor = UNIT_PREFIXES[unit_prefix] || 1;
    if (currentFactor === targetFactor) {
      return {state, unit_of_measurement};
    }
    return {
      state: state * currentFactor / targetFactor,
      unit_of_measurement: prefix 
        ? unit_of_measurement.replace(prefix, unit_prefix) : unit_prefix + unit_of_measurement,
    };
  }

  private _handleAction(ev: ActionHandlerEvent): void {
    console.log('@TODO');
    if (this.hass && this.config && ev.detail.action) {
      // handleAction(this, this.hass, this.config, ev.detail.action);
    }
  }

  // private _showWarning(warning: string): TemplateResult {
  //   return html`
  //     <hui-warning>${warning}</hui-warning>
  //   `;
  // }

  private _showError(error: string): TemplateResult {
    const errorCard = document.createElement('hui-error-card');
    errorCard.setConfig({
      type: 'error',
      error,
      origConfig: this.config,
    });

    return html`
      ${errorCard}
    `;
  }

  private _getEntityId(entity: EntityConfigOrStr): string {
    return typeof entity === 'string' ? entity : entity.entity_id;
  }

  private _getEntityState(entity: EntityConfigOrStr) {
    return this.hass.states[this._getEntityId(entity)];
  }

  static get styles(): CSSResultGroup {
    return styles;
  }
}
