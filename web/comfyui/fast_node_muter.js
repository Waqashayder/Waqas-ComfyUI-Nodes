import { app } from "../../scripts/app.js";
import { NodeTypesString } from "./constants.js";
import { FastGroupsMuter } from "./fast_groups_muter.js";
import { RgthreeToggleNavWidget } from "./utils_widgets.js";
import { filterByColor, filterByTitle, sortBy } from "./utils_fast.js";
import { SERVICE as FAST_GROUPS_SERVICE } from "./fast_groups_service.js";
const PROPERTY_SORT = "sort";
const PROPERTY_SORT_CUSTOM_ALPHA = "customSortAlphabet";
const PROPERTY_MATCH_COLORS = "matchColors";
const PROPERTY_MATCH_TITLE = "matchTitle";
const PROPERTY_MATCH_TITLE_GROUP = "matchGroupTitle";
const PROPERTY_RESTRICTION = "toggleRestriction";
export class FastNodeMuter extends FastGroupsMuter {
    constructor(title = FastNodeMuter.title) {
        super(title);
        this.modeOn = LiteGraph.ALWAYS;
        this.modeOff = LiteGraph.NEVER;
        this.properties[PROPERTY_MATCH_TITLE_GROUP] = "";
    }
    static setUp(clazz) {
        LiteGraph.registerNodeType(clazz.type, clazz);
        clazz.category = clazz._category;
    }
    getNodes(sort) {
        var _a, _b;
        const matchGroup = (_a = this.properties) === null || _a === void 0 ? void 0 : _a[PROPERTY_MATCH_TITLE_GROUP];
        if (!matchGroup) {
            const graph = app.graph;
            return [...((_b = graph._nodes) !== null && _b !== void 0 ? _b : [])].filter((n) => !n.isVirtualNode);
        }
        const pattern = new RegExp(matchGroup, "i");
        const allGroups = FAST_GROUPS_SERVICE.getGroups(sort);
        const filteredGroups = allGroups.filter((group) => pattern.exec(group.title));
        return Array.from(new Set(filteredGroups.map((group) => group._nodes).flat()));
    }
    refreshWidgets() {
        var _a, _b, _c, _d, _e, _f;
        let sort = ((_a = this.properties) === null || _a === void 0 ? void 0 : _a[PROPERTY_SORT]) || "position";
        const nodes = this.getNodes(sort);
        const alphaSorted = sortBy(nodes, {
            customAlphabet: (_c = (_b = this.properties) === null || _b === void 0 ? void 0 : _b[PROPERTY_SORT_CUSTOM_ALPHA]) === null || _c === void 0 ? void 0 : _c.replace(/\n/g, ""),
            sort,
        });
        const colorFiltered = filterByColor(alphaSorted, {
            matchColors: (_d = this.properties) === null || _d === void 0 ? void 0 : _d[PROPERTY_MATCH_COLORS],
            nodeColorOption: "color",
        });
        const titleFiltered = filterByTitle(colorFiltered, {
            matchTitle: (_f = (_e = this.properties) === null || _e === void 0 ? void 0 : _e[PROPERTY_MATCH_TITLE]) === null || _f === void 0 ? void 0 : _f.trim(),
        });
        let index = 0;
        for (const node of titleFiltered) {
            this.widgets = this.widgets || [];
            const nodeTitle = nodeWithIndex(nodes, node);
            const widgetName = `Enable ${nodeTitle}`;
            let widget = this.getOrCreateWidget(node, widgetName);
            if (widget.name != widgetName) {
                widget.name = widgetName;
                this.setDirtyCanvas(true, false);
            }
            const nodeActive = node.mode === LiteGraph.ALWAYS;
            if (widget.value != nodeActive) {
                widget.value = nodeActive;
                this.setDirtyCanvas(true, false);
            }
            if (this.widgets[index] !== widget) {
                const oldIndex = this.widgets.findIndex((w) => w === widget);
                this.widgets.splice(index, 0, this.widgets.splice(oldIndex, 1)[0]);
                this.setDirtyCanvas(true, false);
            }
            index++;
        }
        while ((this.widgets || [])[index]) {
            this.removeWidget(index++);
        }
    }
    getOrCreateWidget(node, widgetName) {
        const existingWidget = this.widgets.find((w) => w.name === widgetName);
        if (existingWidget && existingWidget instanceof RgthreeToggleNavWidget) {
            return existingWidget;
        }
        this.tempSize = [...this.size];
        const widget = this.addCustomWidget(new RgthreeToggleNavWidget(node, () => this.showNav, (force, skipOtherNodeCheck) => {
            var _a, _b, _c, _d;
            const hasAnyActiveNodes = node.mode === LiteGraph.ALWAYS;
            let newValue = force != null ? force : !hasAnyActiveNodes;
            if (skipOtherNodeCheck !== true) {
                if (newValue && ((_b = (_a = this.properties) === null || _a === void 0 ? void 0 : _a[PROPERTY_RESTRICTION]) === null || _b === void 0 ? void 0 : _b.includes(" one"))) {
                    for (const widget of this.widgets) {
                        (_c = widget.doModeChange) === null || _c === void 0 ? void 0 : _c.call(widget, false, true);
                    }
                }
                else if (!newValue && ((_d = this.properties) === null || _d === void 0 ? void 0 : _d[PROPERTY_RESTRICTION]) === "always one") {
                    newValue = this.widgets.every((w) => !w.value || w === widget);
                }
            }
            node.mode = (newValue ? this.modeOn : this.modeOff);
            widget.value = newValue;
            app.graph.setDirtyCanvas(true, false);
        }));
        this.setSize(this.computeSize());
        return widget;
    }
}
FastNodeMuter.type = NodeTypesString.FAST_NODE_MUTER;
FastNodeMuter.title = NodeTypesString.FAST_NODE_MUTER;
FastNodeMuter["@matchTitleGroup"] = { type: "string" };
app.registerExtension({
    name: "rgthree.FastNodeMuter",
    registerCustomNodes() {
        FastNodeMuter.setUp(FastNodeMuter);
    },
    loadedGraphNode(node) {
        if (node.type == FastNodeMuter.title) {
            node.tempSize = [...node.size];
        }
    },
});
function nodeWithIndex(nodes, node) {
    const { title } = node;
    const sameNameNodes = nodes.filter((n) => n.title === title);
    if (sameNameNodes.length === 1) {
        return title;
    }
    return `${title} ${sameNameNodes.indexOf(node) + 1}/${sameNameNodes.length}`;
}
