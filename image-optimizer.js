{
    constants: {
      imageCount: 0  
    },

	noteOption: {
		"Optimize note": {
			check: async function(app, noteUUID) {
				return true
			},
			run: async function(app, noteUUID) {
				const noteHandle = { uuid: noteUUID };
				const note = await app.notes.find(app.context.noteUUID);
				const images = await app.getNoteImages(noteHandle);
				const maxSize = await app.prompt("Enter max image size (KB)");

                const maxSizeNum = Number(maxSize);
                if (isNaN(maxSizeNum) || maxSizeNum <= 0) {
                    app.alert("Invalid input. Please enter a positive number.");
                    return
                }

				for (const img of images) {
					let dataURL = await this.compressImage(`https://amplenote-plugins-cors-anywhere.onrender.com/${img.src}`, maxSize);
                    if (dataURL.startsWith("blob:")) {
                        continue; // Skip uploading if the original image is already small enough
                    }
					const fileURL = await app.attachNoteMedia(noteHandle, dataURL);
					await note.updateImage(img, { src: fileURL });
				}

                app.alert("Successfully comprsesed " + this.constants.imageCount + " images!")
			}
		}
	},

	async compressImage(imageUrl, targetSizeKB) {
      const targetSizeBytes = targetSizeKB * 1024;

      // Fetch image as blob
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      if (blob.size <= targetSizeBytes) {
          console.log("already in size limit")
          return URL.createObjectURL(blob); // Return original if it's already smaller
      }


      const img = await createImageBitmap(blob);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);


      let quality = 0.9;
      while (quality > 0) {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const compressedSize = dataUrl.length * 0.75; // Approximate size in bytes
          if (compressedSize <= targetSizeBytes) {
              return dataUrl;
          }
          quality -= 0.1;
      }


      this.constants.imageCount+= 1;

      return canvas.toDataURL('image/jpeg', 0.1); // Return lowest quality possible
  }
}