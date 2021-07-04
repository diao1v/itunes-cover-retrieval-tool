window.addEventListener("load", async function () {
  if (document.querySelector(".processingPage")) {
    const response = await fetch("./processing");
    const result = await response.json()
    console.log(result)
    if(result==true){
      window.location.href = "./download";
    }
  }

  if(document.querySelector(".svg_img")){
    document.querySelector(".svg_img").style.display = "block"
  }

});
