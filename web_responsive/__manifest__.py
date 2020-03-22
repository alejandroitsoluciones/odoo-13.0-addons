{
    "name": "Web Responsive",
    "summary": "Responsive Web Client, Community-Supported",
    "version": "13.0.2.0.1",
    "category": "Website",
    "website": "https://github.com/OCA/web",
    "author": "Odoo Community Association (OCA)",
    "license": "AGPL-3",
    "installable": True,
    "depends": ["web", "mail"],
    "development_status": "Production/Stable",
    "data": ["views/assets.xml", "views/res_users.xml", "views/web.xml"],
    "qweb": [
        "static/src/xml/apps.xml",
        "static/src/xml/form_view.xml",
        "static/src/xml/navbar.xml",
        "static/src/xml/document_viewer.xml",
    ],
}
