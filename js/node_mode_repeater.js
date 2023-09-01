import { app } from "../../scripts/app.js";
import { BaseCollectorNode } from './base_node_collector.js';
import { NodeTypesString, stripRgthree } from "./constants.js";
import { addConnectionLayoutSupport, addHelp, getConnectedInputNodes, getConnectedOutputNodes } from "./utils.js";
class NodeModeRepeater extends BaseCollectorNode {
    constructor(title) {
        super(title);
        this.hasRelayInput = false;
        this.hasTogglerOutput = false;
        this.removeOutput(0);
        this.addOutput('FAST_TOGGLER', '_FAST_TOGGLER_', {
            color_on: '#Fc0',
            color_off: '#a80',
        });
    }
    onConnectOutput(outputIndex, inputType, inputSlot, inputNode, inputIndex) {
        var _a;
        let canConnect = !this.hasRelayInput;
        if (super.onConnectOutput) {
            canConnect = canConnect && ((_a = super.onConnectOutput) === null || _a === void 0 ? void 0 : _a.call(this, outputIndex, inputType, inputSlot, inputNode, inputIndex));
        }
        let nextNode = getConnectedOutputNodes(app, this, inputNode)[0] || inputNode;
        return canConnect && (nextNode.type === NodeTypesString.FAST_MUTER || nextNode.type === NodeTypesString.FAST_BYPASSER);
    }
    onConnectInput(inputIndex, outputType, outputSlot, outputNode, outputIndex) {
        var _a;
        let canConnect = true;
        if (super.onConnectInput) {
            canConnect = canConnect && ((_a = super.onConnectInput) === null || _a === void 0 ? void 0 : _a.call(this, inputIndex, outputType, outputSlot, outputNode, outputIndex));
        }
        let nextNode = getConnectedOutputNodes(app, this, outputNode)[0] || outputNode;
        const isNextNodeRelay = nextNode.type === NodeTypesString.NODE_MODE_RELAY;
        return canConnect && (!isNextNodeRelay || !this.hasTogglerOutput);
    }
    onConnectionsChange(type, slotIndex, isConnected, linkInfo, ioSlot) {
        super.onConnectionsChange(type, slotIndex, isConnected, linkInfo, ioSlot);
        let hasTogglerOutput = false;
        let hasRelayInput = false;
        const outputNodes = getConnectedOutputNodes(app, this);
        for (const outputNode of outputNodes) {
            if ((outputNode === null || outputNode === void 0 ? void 0 : outputNode.type) === NodeTypesString.FAST_MUTER || (outputNode === null || outputNode === void 0 ? void 0 : outputNode.type) === NodeTypesString.FAST_BYPASSER) {
                hasTogglerOutput = true;
                break;
            }
        }
        const inputNodes = getConnectedInputNodes(app, this);
        for (const [index, inputNode] of inputNodes.entries()) {
            if ((inputNode === null || inputNode === void 0 ? void 0 : inputNode.type) === NodeTypesString.NODE_MODE_RELAY) {
                if (hasTogglerOutput) {
                    console.log(`Can't be connected to a Relay if also output to a toggler.`);
                    this.disconnectInput(index);
                }
                else {
                    hasRelayInput = true;
                    if (this.inputs[index]) {
                        this.inputs[index].color_on = '#FC0';
                        this.inputs[index].color_off = '#a80';
                    }
                }
            }
            else {
                inputNode.mode = this.mode;
            }
        }
        this.hasTogglerOutput = hasTogglerOutput;
        this.hasRelayInput = hasRelayInput;
        if (this.hasRelayInput) {
            if (this.outputs[0]) {
                this.disconnectOutput(0);
                this.removeOutput(0);
            }
        }
        else if (!this.outputs[0]) {
            this.addOutput('FAST_TOGGLER', '_FAST_TOGGLER_', {
                color_on: '#Fc0',
                color_off: '#a80',
            });
        }
    }
    onModeChange() {
        super.onModeChange();
        const linkedNodes = getConnectedInputNodes(app, this);
        for (const node of linkedNodes) {
            if (node.type !== NodeTypesString.NODE_MODE_RELAY) {
                node.mode = this.mode;
            }
        }
    }
}
NodeModeRepeater.type = NodeTypesString.NODE_MODE_REPEATER;
NodeModeRepeater.title = NodeTypesString.NODE_MODE_REPEATER;
NodeModeRepeater.help = [
    `When this node's mode (Mute, Bypass, Active) changes, it will "repeat" that mode to all`,
    `connected input nodes.`,
    `\n`,
    `\n- Optionally, connect this mode's output to a ${stripRgthree(NodeTypesString.FAST_MUTER)}`,
    `or ${stripRgthree(NodeTypesString.FAST_BYPASSER)} for a single toggle to quickly`,
    `mute/bypass all its connected nodes.`,
    `\n- Optionally, connect a ${stripRgthree(NodeTypesString.NODE_MODE_RELAY)} to this nodes'`,
    `inputs to have it automatically toggle its mode. If connected, this will always take`,
    `precedence (and disconnect any connected fast togglers)`,
].join(' ');
app.registerExtension({
    name: "rgthree.NodeModeRepeater",
    registerCustomNodes() {
        addHelp(NodeModeRepeater, app);
        addConnectionLayoutSupport(NodeModeRepeater, app, [['Left', 'Right'], ['Right', 'Left']]);
        LiteGraph.registerNodeType(NodeModeRepeater.type, NodeModeRepeater);
        NodeModeRepeater.category = NodeModeRepeater._category;
    },
});
