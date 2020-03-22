odoo.define("web_responsive", function(require) {
    "use strict";

    const ActionManager = require("web.ActionManager");
    const AbstractWebClient = require("web.AbstractWebClient");
    const AppsMenu = require("web.AppsMenu");
    const BasicController = require("web.BasicController");
    const config = require("web.config");
    const core = require("web.core");
    const FormRenderer = require("web.FormRenderer");
    const Menu = require("web.Menu");
    const RelationalFields = require("web.relational_fields");
    const Chatter = require("mail.Chatter");
    const ListRenderer = require("web.ListRenderer");
    const DocumentViewer = require("mail.DocumentViewer");

    /*
        Ocultar AppDrawer en los modos de escritorio y móvil. 
        Para evitar retrasos en las páginas con muchos nodos DOM, 
        hacemos subgrupos con 'querySelector' para mejorar el rendimiento.
     */
    function closeAppDrawer() {
        _.defer(function() {
            var menu_apps_dropdown = document.querySelector(".o_menu_apps .dropdown");
            $(menu_apps_dropdown)
                .has(".dropdown-menu.show")
                .find("> a")
                .dropdown("toggle");
            var menu_sections = document.querySelector(
                ".o_menu_sections li.show .dropdown-toggle"
            );
            $(menu_sections).dropdown("toggle");
            var menu_sections_mobile = document.querySelector(".o_menu_sections.show");
            $(menu_sections_mobile).collapse("hide");
        });
    }

    /**
     * 
     * `AppsMenu.init() obtiene `menuData` en un formato similar a este (solo se muestran los datos relevantes):
     *
     * ```js
     * {
     *  [...],
     *  children: [
     *    {
     *      action: "ir.actions.client,94", // Or `false`
     *      children: [... similar to above "children" key],
     *      name: "Actions",
     *      parent_id: [146, "Settings/Technical/Actions"], // Or `false`
     *    },
     *    ...
     *  ]
     * }
     * ```
     *
     * Este formato es muy difícil de procesar para buscar coincidencias, y ralentizaría el algoritmo de búsqueda,
     * por lo que lo reducimos con este método para poder implementar luego una búsqueda más simple.
     *
     * @param {Object} memo
     * Referencia al objeto de resultado actual, pasado en llamadas recursivas.
     *
     * @param {Object} menu
     * Una entrada de menú, como se describió anteriormente.
     *
     * @returns {Object}
     * Objeto reducido, sin entradas que no tienen acción, 
     * y con un formato como este:
     *
     * ```js
     * {
     *  "Discuss": {Menu entry Object},
     *  "Settings": {Menu entry Object},
     *  "Settings/Technical/Actions/Actions": {Menu entry Object},
     *  ...
     * }
     * ```
     */
    function findNames(memo, menu) {
        if (menu.action) {
            var key = menu.parent_id ? menu.parent_id[1] + "/" : "";
            memo[key + menu.name] = menu;
        }
        if (menu.children.length) {
            _.reduce(menu.children, findNames, memo);
        }
        return memo;
    }

    AppsMenu.include({
        events: _.extend(
            {
                "keydown .search-input input": "_searchResultsNavigate",
                "input .search-input input": "_searchMenusSchedule",
                "click .o-menu-search-result": "_searchResultChosen",
                "shown.bs.dropdown": "_searchFocus",
                "hidden.bs.dropdown": "_searchReset",
                "hide.bs.dropdown": "_hideAppsMenu",
            },
            AppsMenu.prototype.events
        ),

        /**
         * Rescata algunos datos del menú eliminados en el método original.
         *
         * @override
         */
        init: function(parent, menuData) {
            this._super.apply(this, arguments);
            for (const n in this._apps) {
                this._apps[n].web_icon_data = menuData.children[n].web_icon_data;
            }
            this._searchableMenus = _.reduce(menuData.children, findNames, {});
            this._search_def = false;
        },

        /**
         * @override
         */
        start: function() {
            this.$search_container = this.$(".search-container");
            this.$search_input = this.$(".search-input input");
            this.$search_results = this.$(".search-results");
            return this._super.apply(this, arguments);
        },

        /**
         * Evita que el menú se abra dos veces.
         *
         * @override
         */
        _onAppsMenuItemClicked: function(ev) {
            this._super.apply(this, arguments);
            ev.preventDefault();
            ev.stopPropagation();
        },

        /**
         * Obtenga toda la información para un menú dado.
         *
         * @param {String} key
         * Ruta completa al menú solicitado.
         *
         * @returns {Object}
         * Definición del menú, más teclas adicionales necesarias.
         */
        _menuInfo: function(key) {
            const original = this._searchableMenus[key];
            return _.extend(
                {
                    action_id: parseInt(original.action.split(",")[1], 10),
                },
                original
            );
        },

        /**
         * Enfoque automático en el campo de búsqueda en pantallas grandes.
         */
        _searchFocus: function() {
            if (!config.device.isMobile) {
                this.$search_input.focus();
            }
        },

        /**
         * Restablecer entrada de búsqueda y resultados.
         */
        _searchReset: function() {
            this.$search_container.removeClass("has-results");
            this.$search_results.empty();
            this.$search_input.val("");
        },

        /**
         * Programe una búsqueda en los elementos del menú actual.
         */
        _searchMenusSchedule: function() {
            this._search_def = new Promise(resolve => {
                setTimeout(resolve, 50);
            });
            this._search_def.then(this._searchMenus.bind(this));
        },

        /**
         * Busque entre los elementos de menú disponibles y renderice esa búsqueda.
         */
        _searchMenus: function() {
            const query = this.$search_input.val();
            if (query === "") {
                this.$search_container.removeClass("has-results");
                this.$search_results.empty();
                return;
            }
            var results = fuzzy.filter(query, _.keys(this._searchableMenus), {
                pre: "<b>",
                post: "</b>",
            });
            this.$search_container.toggleClass("has-results", Boolean(results.length));
            this.$search_results.html(
                core.qweb.render("web_responsive.MenuSearchResults", {
                    results: results,
                    widget: this,
                })
            );
        },

        /**
         * El uso elige un resultado de búsqueda, por lo que navegamos a ese menú
         *
         * @param {jQuery.Event} event
         */
        _searchResultChosen: function(event) {
            event.preventDefault();
            event.stopPropagation();
            const $result = $(event.currentTarget),
                text = $result.text().trim(),
                data = $result.data(),
                suffix = ~text.indexOf("/") ? "/" : "";
            this.trigger_up("menu_clicked", {
                action_id: data.actionId,
                id: data.menuId,
                previous_menu_id: data.parentId,
            });
            const app = _.find(this._apps, function(_app) {
                return text.indexOf(_app.name + suffix) === 0;
            });
            core.bus.trigger("change_menu_section", app.menuID);
        },

        /**
         * Navega entre los resultados de búsqueda
         *
         * @param {jQuery.Event} event
         */
        _searchResultsNavigate: function(event) {
            // Encuentra los resultados actuales y el elemento activo (primero por defecto)
            const all = this.$search_results.find(".o-menu-search-result"),
                pre_focused = all.filter(".active") || $(all[0]);
            let offset = all.index(pre_focused),
                key = event.key;
            // La navegación por teclado solo admite resultados de búsqueda
            if (!all.length) {
                return;
            }
            if (key === "Tab") {
                event.preventDefault();
                key = event.shiftKey ? "ArrowUp" : "ArrowDown";
            }
            switch (key) {
                // Presionar enter es lo mismo que hacer clic en el elemento activo
                case "Enter":
                    pre_focused.click();
                    break;
                // Navega hacia arriba o hacia abajo
                case "ArrowUp":
                    offset--;
                    break;
                case "ArrowDown":
                    offset++;
                    break;
                default:
                    // Otras teclas son inútiles en este evento.
                    return;
            }
            // Permitir bucles en los resultados
            if (offset < 0) {
                offset = all.length + offset;
            } else if (offset >= all.length) {
                offset -= all.length;
            }
            // Cambiar elemento activo
            const new_focused = $(all[offset]);
            pre_focused.removeClass("active");
            new_focused.addClass("active");
            this.$search_results.scrollTo(new_focused, {
                offset: {
                    top: this.$search_results.height() * -0.5,
                },
            });
        },

        /*
         * Controle si AppDrawer puede cerrarse
         */
        _hideAppsMenu: function() {
            return !this.$("input").is(":focus");
        },
    });

    BasicController.include({
        /**
         * Cierre AppDrawer si el conjunto de datos está sucio 
         * y se abre un cuadro de diálogo de descarte
         *
         * @override
         */
        canBeDiscarded: function(recordID) {
            if (this.model.isDirty(recordID || this.handle)) {
                closeAppDrawer();
            }
            return this._super.apply(this, arguments);
        },
    });

    Menu.include({
        events: _.extend(
            {
                "click .o_menu_sections [role=menuitem]": "_onClickMenuItem",
                "show.bs.dropdown .o_menu_systray, .o_menu_apps": "_hideMobileSubmenus",
            },
            Menu.prototype.events
        ),

        start: function() {
            this.$menu_toggle = this.$(".o-menu-toggle");
            return this._super.apply(this, arguments);
        },

        /**
         * Ocultar menús para la aplicación actual si estás en el móvil
         */
        _hideMobileSubmenus: function() {
            if (
                config.device.isMobile &&
                this.$menu_toggle.is(":visible") &&
                this.$section_placeholder.is(":visible")
            ) {
                this.$section_placeholder.collapse("hide");
            }
        },

        /**
         * Evite ocultar el menú (debe cerrarse cuando se carga la acción)
         *
         * @param {ClickEvent} ev
         */
        _onClickMenuItem: function(ev) {
            ev.stopPropagation();
        },

        /**
         * No hay marca de menú en móviles
         *
         * @override
         */
        _updateMenuBrand: function() {
            if (!config.device.isMobile) {
                return this._super.apply(this, arguments);
            }
        },
    });

    RelationalFields.FieldStatus.include({
        /**
         * Doblar todo en los móviles.
         *
         * @override
         */
        _setState: function() {
            this._super.apply(this, arguments);
            if (config.device.isMobile) {
                _.map(this.status_information, value => {
                    value.fold = true;
                });
            }
        },
    });

    // Selector de columna
    ListRenderer.include({
        _renderView: function() {
            const self = this;
            return this._super.apply(this, arguments).then(() => {
                const $col_selector = self.$el.find(
                    ".o_optional_columns_dropdown_toggle"
                );
                if ($col_selector.length !== 0) {
                    const $th = self.$el.find("thead>tr:first>th:last");
                    $col_selector.appendTo($th);
                }
            });
        },

        _onToggleOptionalColumnDropdown: function(ev) {
            /**
             * REVISIÓN: Por alguna extraña razón, la llamada 'stopPropagation' en el método principal no funciona. 
             * Invocando aquí el mismo método hace el comportamiento esperado.
             * Esto evita que se inicie la acción de ordenar la columna.
             */
            ev.stopPropagation();
            this._super.apply(this, arguments);
        },
    });

    //
    FormRenderer.include({
        /**
         * En los móviles, coloca todos los botones de la barra de estado en un menú desplegable.
         *
         * @override
         */
        _renderHeaderButtons: function() {
            const $buttons = this._super.apply(this, arguments);
            if (
                !config.device.isMobile ||
                !$buttons.is(":has(>:not(.o_invisible_modifier))")
            ) {
                return $buttons;
            }

            $buttons.addClass("dropdown-menu");
            const $dropdown = $(
                core.qweb.render("web_responsive.MenuStatusbarButtons")
            );
            $buttons.addClass("dropdown-menu").appendTo($dropdown);
            return $dropdown;
        },
    });

    Chatter.include({
        _openComposer: function(options) {
            if (
                this._composer &&
                options.isLog === this._composer.options.isLog &&
                this._composer.$el.is(":visible")
            ) {
                this._closeComposer(false);
            } else {
                this._super.apply(this, arguments);
            }
        },
    });

    // Ocultar AppDrawer o Menú cuando la acción se haya completado
    ActionManager.include({
        /**
         * @override
         */
        _appendController: function() {
            this._super.apply(this, arguments);
            closeAppDrawer();
        },
    });

    /**
     * Use ALT + MAYÚS en lugar de ALT como activador de teclas de acceso rápido.
     *
     * 
     * No se puede parchear directamente en `KeyboardNavigationMixin` porque es un mixin, 
     * no una` Class`, y alterar el `prototipo` de un mixin no lo altera donde ya se ha utilizado.
     * 
     * En cambio, proporcionamos un mixin adicional para usar donde sea que 
     * necesite habilitar este comportamiento.
     */
    var KeyboardNavigationShiftAltMixin = {
        /**
         * Modifique el evento clave para que requiera presionar Shift.
         * 
         * Esto producirá un objeto de evento simulado donde parecerá 
         * que no se presiona `Alt` si no se presiona` Shift`.
         *
         * La razón de esto es que el código original, que se encuentra en `KeyboardNavigationMixin`, 
         * está muy codificado con la tecla` Alt`, por lo que es más fácil de burlar su 
         * entrada que reescribirla por completo.
         *
         * @param {keyEvent} keyEvent
         * 
         *
         * @returns {keyEvent}
         * 
         */
        _shiftPressed: function(keyEvent) {
            const alt = keyEvent.altKey || keyEvent.key === "Alt",
                newEvent = _.extend({}, keyEvent),
                shift = keyEvent.shiftKey || keyEvent.key === "Shift";
            // Evento simulado para que parezca que Alt no está presionado
            if (alt && !shift) {
                newEvent.altKey = false;
                if (newEvent.key === "Alt") {
                    newEvent.key = "Shift";
                }
            }
            return newEvent;
        },

        _onKeyDown: function(keyDownEvent) {
            return this._super(this._shiftPressed(keyDownEvent));
        },

        _onKeyUp: function(keyUpEvent) {
            return this._super(this._shiftPressed(keyUpEvent));
        },
    };

    // Incluya SHIFT + ALT mixin donde sea
    // `KeyboardNavigationMixin` se usa en sentido ascendente
    AbstractWebClient.include(KeyboardNavigationShiftAltMixin);

    // DocumentViewer: Agrega soporte para maximizar/minimizar
    DocumentViewer.include({
            /**
             * Los eventos 'keydown' y 'keyup' del widget solo se envían cuando este $el está activo, 
             * pero ahora el modal tiene botones que pueden obtener el foco. Por esta razón, 
             * ahora escuchamos eventos centrales, que se envían cada vez.
             */
        events: _.extend(
            _.omit(DocumentViewer.prototype.events, ["keydown", "keyup"]),
            {
                "click .o_maximize_btn": "_onClickMaximize",
                "click .o_minimize_btn": "_onClickMinimize",
                "shown.bs.modal": "_onShownModal",
            }
        ),

        start: function() {
            core.bus.on("keydown", this, this._onKeydown);
            core.bus.on("keyup", this, this._onKeyUp);
            return this._super.apply(this, arguments);
        },

        destroy: function() {
            core.bus.off("keydown", this, this._onKeydown);
            core.bus.off("keyup", this, this._onKeyUp);
            this._super.apply(this, arguments);
        },

        _onShownModal: function() {
            /**
             * Deshabilite el enfoque automático para permitir el uso de controles en el modo de edición. 
             * Esto solo afecta el modal activo.
             */
            $(document).off("focusin.modal");
        },
        _onClickMaximize: function() {
            this.$el.removeClass("o_responsive_document_viewer");
        },
        _onClickMinimize: function() {
            this.$el.addClass("o_responsive_document_viewer");
        },
    });
});
