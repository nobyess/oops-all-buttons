"""Human references use source and tag names; driver addresses stay separate."""

def tag_path(tag, source_name):
    return source_name + "\\" + (tag["folder"]+"\\" if tag.get("folder") else "") + tag.get("name", tag["id"])
