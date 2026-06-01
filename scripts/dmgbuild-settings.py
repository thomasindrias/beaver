# dmgbuild settings for Beaver's branded installer DMG.
# Builds the window layout headlessly (writes .DS_Store directly), so it works
# in non-interactive / CI builds — no Finder or AppleScript involved.
# Inputs are passed via environment variables from scripts/release-macos.sh.
import os

app = os.environ["BEAVER_APP"]
appname = os.path.basename(app)

# Compressed read-only image.
format = "UDZO"

# What the DMG contains: the app plus a drop-link to /Applications.
files = [app]
symlinks = {"Applications": "/Applications"}

# Volume icon (the icon shown for the mounted disk), optional.
_volicon = os.environ.get("BEAVER_VOLICON")
if _volicon:
    icon = _volicon

# Branded background. A HiDPI .tiff (1x + @2x) keeps it crisp on retina.
background = os.environ["BEAVER_DMG_BG"]

# 660x420 window matches the background art.
window_rect = ((200, 180), (660, 420))
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
icon_size = 128
text_size = 13

# Icon positions match the background's "drag the app into Applications" arrow.
icon_locations = {
    appname: (180, 210),
    "Applications": (480, 210),
}
