from odoo import fields, models


class ResUsers(models.Model):
    _inherit = "res.users"

    chatter_position = fields.Selection(
        [("normal", "Normal"), ("sided", "Sided")],
        string="Chatter Position",
        default="sided",
    )

    def __init__(self, pool, cr):
        """Anulación de __init__ para agregar derechos de acceso.
        Los derechos de acceso están deshabilitados de manera predeterminada, pero se 
        permiten en algunos campos específicos definidos en self.SELF_{READ/WRITE}ABLE_FIELDS.
        """
        super(ResUsers, self).__init__(pool, cr)
        # LISTA DUPLICADA PARA EVITAR MODIFICAR LA REFERENCIA ORIGINAL
        type(self).SELF_WRITEABLE_FIELDS = list(self.SELF_WRITEABLE_FIELDS)
        type(self).SELF_WRITEABLE_FIELDS.extend(["chatter_position"])
        # LISTA DUPLICADA PARA EVITAR MODIFICAR LA REFERENCIA ORIGINAL
        type(self).SELF_READABLE_FIELDS = list(self.SELF_READABLE_FIELDS)
        type(self).SELF_READABLE_FIELDS.extend(["chatter_position"])
