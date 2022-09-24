Take a screenshot of the UI
===========================

Replace `MusicianFrame` by any other frame you want to take a screenshot of.

Add opaque background
---------------------
```lua
/script local frame = MusicianFrame; local tex = UIParent:CreateTexture(nil, "BACKGROUND", nil, 2); tex:SetColorTexture(.1, .1, .1, 1); tex:SetPoint("BOTTOMLEFT", frame, 10, 10); tex:SetPoint("TOPRIGHT", frame, -10, -10);
```

Add green background
--------------------
```lua
/script local frame = MusicianFrame; local tex = UIParent:CreateTexture(nil, "BACKGROUND", nil, 2); tex:SetColorTexture(0, 1, 0, 1); tex:SetPoint("BOTTOMLEFT", frame, -5, -5); tex:SetPoint("TOPRIGHT", frame, 5, 5);
```

Make a green background screenshot transparent
----------------------------------------------

1. Import the screenshot in a temporary **Adobe Premiere** project.
2. Apply **Ultra Key** effect to the image.
3. Set the background color in the Ultra Key effect.
4. Click the screenshot button to make the transparent PNG.
