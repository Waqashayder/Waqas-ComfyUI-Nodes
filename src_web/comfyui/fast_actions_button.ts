import type { RgthreeBaseVirtualNodeConstructor } from "typings/rgthree.js";
import type { ComfyApp, ComfyWidget } from "typings/comfy.js";
import type { IWidget, LGraph, LGraphNode, SerializedLGraphNode } from "typings/litegraph.js";
import type { RgthreeBaseNode } from "./base_node.js";

import { app } from "scripts/app.js";
import { BaseAnyInputConnectedNode } from "./base_any_input_connected_node.js";
import { NodeTypesString } from "./constants.js";
import { addMenuItem } from "./utils.js";
import { rgthree } from "./rgthree.js";

const MODE_ALWAYS = 0;
const MODE_MUTE = 2;
const MODE_BYPASS = 4;

/**
 * The Fast Actions Button.
 *
 * This adds a button that the user can connect any node to and then choose an action to take on
 * that node when the button is pressed. Default actions are "Mute," "Bypass," and "Enable," but
 * Nodes can expose actions additional actions that can then be called back.
 */
class FastActionsButton extends BaseAnyInputConnectedNode {
  static override type = NodeTypesString.FAST_ACTIONS_BUTTON;
  static override title = NodeTypesString.FAST_ACTIONS_BUTTON;
  override comfyClass = NodeTypesString.FAST_ACTIONS_BUTTON;

  readonly logger = rgthree.newLogSession("[FastActionsButton]");

  static "@buttonText" = { type: "string" };
  static "@shortcutModifier" = {
    type: "combo",
    values: ["ctrl", "alt", "shift"],
  };
  static "@shortcutKey" = { type: "string" };

  static collapsible = false;

  override readonly isVirtualNode = true;

  override serialize_widgets = true;

  readonly buttonWidget: IWidget;

  readonly widgetToData = new Map<IWidget, { comfy?: ComfyApp; node?: LGraphNode }>();
  readonly nodeIdtoFunctionCache = new Map<number, string>();

  readonly keypressBound;
  readonly keyupBound;

  private executingFromShortcut = false;

  constructor(title?: string) {
    super(title);
    this.properties["buttonText"] = "🎬 Action!";
    this.properties["shortcutModifier"] = "alt";
    this.properties["shortcutKey"] = "";
    this.buttonWidget = this.addWidget(
      "button",
      this.properties["buttonText"],
      null,
      () => {
        this.executeConnectedNodes();
      },
      { serialize: false },
    );

    this.keypressBound = this.onKeypress.bind(this);
    this.keyupBound = this.onKeyup.bind(this);
    this.onConstructed();
  }

  /** When we're given data to configure, like from a PNG or JSON. */
  override configure(info: SerializedLGraphNode<LGraphNode>): void {
    super.configure(info);
    // Since we add the widgets dynamically, we need to wait to set their values
    // with a short timeout.
    setTimeout(() => {
      if (info.widgets_values) {
        for (let [index, value] of info.widgets_values.entries()) {
          if (index > 0) {
            if (value.startsWith("comfy_action:")) {
              value = value.replace("comfy_action:", "");
              this.addComfyActionWidget(index, value);
            }
            if (this.widgets[index]) {
              this.widgets[index]!.value = value;
            }
          }
        }
      }
    }, 100);
  }

  override clone() {
    const cloned = super.clone();
    cloned.properties["buttonText"] = "🎬 Action!";
    cloned.properties["shortcutKey"] = "";
    return cloned;
  }

  override onAdded(graph: LGraph): void {
    window.addEventListener("keydown", this.keypressBound);
    window.addEventListener("keyup", this.keyupBound);
  }

  override onRemoved(): void {
    window.removeEventListener("keydown", this.keypressBound);
    window.removeEventListener("keyup", this.keyupBound);
  }

  async onKeypress(event: KeyboardEvent) {
    const target = (event.target as HTMLElement)!;
    if (
      this.executingFromShortcut ||
      target.localName == "input" ||
      target.localName == "textarea"
    ) {
      return;
    }
    if (
      this.properties["shortcutKey"].trim() &&
      this.properties["shortcutKey"].toLowerCase() === event.key.toLowerCase()
    ) {
      const shortcutModifier = this.properties["shortcutModifier"];
      let good = shortcutModifier === "ctrl" && event.ctrlKey;
      good = good || (shortcutModifier === "alt" && event.altKey);
      good = good || (shortcutModifier === "shift" && event.shiftKey);
      good = good || (shortcutModifier === "meta" && event.metaKey);
      if (good) {
        setTimeout(() => {
          this.executeConnectedNodes();
        }, 20);
        this.executingFromShortcut = true;
        event.preventDefault();
        event.stopImmediatePropagation();
        app.canvas.dirty_canvas = true;
        return false;
      }
    }
    return;
  }

  onKeyup(event: KeyboardEvent) {
    const target = (event.target as HTMLElement)!;
    if (target.localName == "input" || target.localName == "textarea") {
      return;
    }
    this.executingFromShortcut = false;
  }

  override onPropertyChanged(property: string, value: any, _prevValue: any): boolean | void {
    if (property == "buttonText") {
      this.buttonWidget.name = value;
    }
    if (property == "shortcutKey") {
      value = value.trim();
      this.properties["shortcutKey"] = (value && value[0].toLowerCase()) || "";
    }
  }

  override handleLinkedNodesStabilization(linkedNodes: LGraphNode[]) {
    let changed = false;
    // Remove any widgets and data for widgets that are no longer linked.
    for (const [widget, data] of this.widgetToData.entries()) {
      if (!data.node) {
        continue;
      }
      if (!linkedNodes.includes(data.node)) {
        const index = this.widgets.indexOf(widget);
        if (index > -1) {
          this.widgetToData.delete(widget);
          this.removeWidget(widget);
          changed = true;
        } else {
          const [m, a] = this.logger.debugParts("Connected widget is not in widgets... weird.");
          console[m]?.(...a);
        }
      }
    }

    const badNodes: LGraphNode[] = []; // Nodes that are deleted elsewhere may not exist in linkedNodes.
    let indexOffset = 1; // Start with button, increment when we hit a non-node widget (like comfy)
    for (const [index, node] of linkedNodes.entries()) {
      // Sometimes linkedNodes is stale.
      if (!node) {
        const [m, a] = this.logger.debugParts("linkedNode provided that does not exist. ");
        console[m]?.(...a);
        badNodes.push(node);
        continue;
      }
      let widgetAtSlot = this.widgets[index + indexOffset];
      if (widgetAtSlot && this.widgetToData.get(widgetAtSlot)?.comfy) {
        indexOffset++;
        widgetAtSlot = this.widgets[index + indexOffset];
      }

      if (!widgetAtSlot || this.widgetToData.get(widgetAtSlot)?.node?.id !== node.id) {
        // Find the next widget that matches the node.
        let widget: IWidget | null = null;
        for (let i = index + indexOffset; i < this.widgets.length; i++) {
          if (this.widgetToData.get(this.widgets[i]!)?.node?.id === node.id) {
            widget = this.widgets.splice(i, 1)[0]!;
            this.widgets.splice(index + indexOffset, 0, widget);
            changed = true;
            break;
          }
        }
        if (!widget) {
          // Add a widget at this spot.
          const exposedActions: string[] = (node.constructor as any).exposedActions || [];
          widget = this.addWidget("combo", node.title, "None", "", {
            values: ["None", "Mute", "Bypass", "Enable", ...exposedActions],
          });
          (widget as ComfyWidget).serializeValue = async (_node: LGraphNode, _index: number) => {
            return widget?.value;
          };
          this.widgetToData.set(widget, { node });
          changed = true;
        }
      }
    }

    // Go backwards through widgets, and remove any that are not in out widgetToData
    for (let i = this.widgets.length - 1; i > linkedNodes.length + indexOffset - 1; i--) {
      const widgetAtSlot = this.widgets[i];
      if (widgetAtSlot && this.widgetToData.get(widgetAtSlot)?.comfy) {
        continue;
      }
      this.removeWidget(widgetAtSlot);
      changed = true;
    }
    return changed;
  }

  override removeWidget(widgetOrSlot?: number | IWidget): void {
    const widget = typeof widgetOrSlot === "number" ? this.widgets[widgetOrSlot] : widgetOrSlot;
    if (widget && this.widgetToData.has(widget)) {
      this.widgetToData.delete(widget);
    }
    super.removeWidget(widgetOrSlot);
  }

  /**
   * Runs through the widgets, and executes the actions.
   */
  async executeConnectedNodes() {
    for (const widget of this.widgets) {
      if (widget == this.buttonWidget) {
        continue;
      }
      const action = widget.value;
      const { comfy, node } = this.widgetToData.get(widget) ?? {};
      if (comfy) {
        if (action === "Queue Prompt") {
          await comfy.queuePrompt(0);
        }
        continue;
      }
      if (node) {
        if (action === "Mute") {
          node.mode = MODE_MUTE;
        } else if (action === "Bypass") {
          node.mode = MODE_BYPASS;
        } else if (action === "Enable") {
          node.mode = MODE_ALWAYS;
        }
        // If there's a handleAction, always call it.
        if ((node as RgthreeBaseNode).handleAction) {
          await (node as RgthreeBaseNode).handleAction(action);
        }
        app.graph.change();
        continue;
      }
      console.warn("Fast Actions Button has a widget without correct data.");
    }
  }

  /**
   * Adds a ComfyActionWidget at the provided slot (or end).
   */
  addComfyActionWidget(slot?: number, value?: string) {
    let widget = this.addWidget(
      "combo",
      "Comfy Action",
      "None",
      () => {
        if (widget.value.startsWith("MOVE ")) {
          this.widgets.push(this.widgets.splice(this.widgets.indexOf(widget), 1)[0]!);
          widget.value = (widget as any)["lastValue_"];
        } else if (widget.value.startsWith("REMOVE ")) {
          this.removeWidget(widget);
        }
        (widget as any)["lastValue_"] = widget.value;
      },
      {
        values: ["None", "Queue Prompt", "REMOVE Comfy Action", "MOVE to end"],
      },
    );
    (widget as any)["lastValue_"] = value;

    (widget as ComfyWidget).serializeValue = async (_node: LGraphNode, _index: number) => {
      return `comfy_app:${widget?.value}`;
    };
    this.widgetToData.set(widget, { comfy: app });

    if (slot != null) {
      this.widgets.splice(slot, 0, this.widgets.splice(this.widgets.indexOf(widget), 1)[0]!);
    }
    return widget;
  }

  override onSerialize(o: SerializedLGraphNode) {
    super.onSerialize && super.onSerialize(o);
    for (let [index, value] of (o.widgets_values || []).entries()) {
      if (this.widgets[index]?.name === "Comfy Action") {
        o.widgets_values![index] = `comfy_action:${value}`;
      }
    }
  }

  static override setUp() {
    super.setUp();
    addMenuItem(this, app, {
      name: "➕ Append a Comfy Action",
      callback: (nodeArg: LGraphNode) => {
        (nodeArg as FastActionsButton).addComfyActionWidget();
      },
    });
  }
}

app.registerExtension({
  name: "rgthree.FastActionsButton",
  registerCustomNodes() {
    FastActionsButton.setUp();
  },
  loadedGraphNode(node: LGraphNode) {
    if (node.type == FastActionsButton.title) {
      (node as FastActionsButton)._tempWidth = node.size[0];
    }
  },
});
